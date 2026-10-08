import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as cookieParser from 'cookie-parser';
import * as path from 'node:path';
import * as request from 'supertest';
import { FeedbackDecision, RemotePolicy, Role, RoleType, User } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Opportunities E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let demoUser: User;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: false,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await resetDatabase();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    process.env.GREENHOUSE_BOARD_TOKENS = '';
    process.env.LEVER_COMPANIES = '';
    process.env.GETONBOARD_DISCOVERY_URL = 'http://unused.local';
    process.env.OPPORTUNITY_BLACKLIST = '';

    await prisma.feedbackSignal.deleteMany();
    await prisma.applicationAttempt.deleteMany();
    await prisma.opportunity.deleteMany();
    await prisma.searchProfile.deleteMany();
    await prisma.cvVariant.deleteMany();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
    await prisma.$disconnect();
  });

  const loginAs = async (email: string, password: string) => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password }).expect(200);
    return agent;
  };

  const seedUser = async (email: string, password: string, role: Role) => {
    const passwordHash = await argon2.hash(password);
    return prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        role,
      },
    });
  };

  const resetDatabase = async () => {
    await prisma.feedbackSignal.deleteMany();
    await prisma.applicationAttempt.deleteMany();
    await prisma.opportunity.deleteMany();
    await prisma.searchProfile.deleteMany();
    await prisma.cvVariant.deleteMany();
    await prisma.jobApplicationHistory.deleteMany();
    await prisma.jobApplication.deleteMany();
    await prisma.user.deleteMany();

    demoUser = await seedUser('demo@jobtracker.com', 'Demo1234!', Role.USER);
  };

  it('crea perfiles y variantes, corre discovery manual, encola y envia por email mockeado', async () => {
    process.env.GREENHOUSE_BOARD_TOKENS = 'acme';
    mockGreenhouseFetch({
      title: 'Frontend Developer',
      email: 'jobs@acme.dev',
      content: 'Frontend role with React and TypeScript. Please email jobs@acme.dev',
    });

    const agent = await loginAs(demoUser.email, 'Demo1234!');
    const cvPath = path.resolve(__dirname, '../../assets/cv/frontend-resume.pdf');

    const cvResponse = await agent
      .post('/cv-variants')
      .send({
        name: 'Frontend Developer CV',
        roleType: RoleType.FRONTEND,
        filePath: cvPath,
      })
      .expect(201);

    await agent
      .post('/search-profiles')
      .send({
        name: 'Frontend Developer',
        roleTargets: ['frontend developer'],
        keywords: ['react', 'typescript'],
        locations: ['remote'],
        remotePolicy: RemotePolicy.REMOTE_ONLY,
        seniority: 'mid-senior',
        dailyLimit: 20,
        sources: ['GREENHOUSE'],
        defaultCvVariantId: cvResponse.body.id,
      })
      .expect(201);

    const batchResponse = await agent.post('/opportunities/run-discovery').expect(201);
    expect(batchResponse.body.inserted).toBe(1);
    expect(batchResponse.body.queued).toBe(1);

    const queuedResponse = await agent
      .get('/opportunities')
      .query({ status: 'QUEUED_FOR_APPROVAL' })
      .expect(200);

    expect(queuedResponse.body.items).toHaveLength(1);
    expect(queuedResponse.body.items[0].applyEmail).toBe('jobs@acme.dev');

    await agent
      .post('/opportunities/approve')
      .send({
        items: [{ opportunityId: queuedResponse.body.items[0].id }],
      })
      .expect(201);

    const attemptsResponse = await agent.get('/application-attempts').expect(200);
    expect(attemptsResponse.body).toHaveLength(1);
    expect(attemptsResponse.body[0]).toMatchObject({
      status: 'SENT',
      recipientEmail: 'jobs@acme.dev',
    });

    const sentResponse = await agent
      .get('/opportunities')
      .query({ status: 'SENT' })
      .expect(200);
    expect(sentResponse.body.items).toHaveLength(1);
  });

  it('deja oportunidades sin email fuera de la cola y permite feedback manual', async () => {
    process.env.GREENHOUSE_BOARD_TOKENS = 'manual-only';
    mockGreenhouseFetch({
      title: 'Frontend Developer',
      email: null,
      content: 'Frontend role with React and TypeScript. Apply through the website only.',
    });

    const agent = await loginAs(demoUser.email, 'Demo1234!');
    const cvPath = path.resolve(__dirname, '../../assets/cv/frontend-resume.pdf');

    const cvResponse = await agent
      .post('/cv-variants')
      .send({
        name: 'Frontend Developer CV',
        roleType: RoleType.FRONTEND,
        filePath: cvPath,
      })
      .expect(201);

    await agent
      .post('/search-profiles')
      .send({
        name: 'Frontend Developer',
        roleTargets: ['frontend developer'],
        keywords: ['react', 'typescript'],
        locations: ['remote'],
        remotePolicy: RemotePolicy.REMOTE_ONLY,
        seniority: 'mid-senior',
        dailyLimit: 20,
        sources: ['GREENHOUSE'],
        defaultCvVariantId: cvResponse.body.id,
      })
      .expect(201);

    const batchResponse = await agent.post('/opportunities/run-discovery').expect(201);
    expect(batchResponse.body.inserted).toBe(1);
    expect(batchResponse.body.queued).toBe(0);

    const qualifiedResponse = await agent
      .get('/opportunities')
      .query({ status: 'QUALIFIED' })
      .expect(200);
    expect(qualifiedResponse.body.items).toHaveLength(1);
    expect(qualifiedResponse.body.items[0].guardDecision).toBe('BLOCK_NO_EMAIL');

    await agent
      .post(`/opportunities/${qualifiedResponse.body.items[0].id}/feedback`)
      .send({
        decision: FeedbackDecision.BAD_MATCH,
        notes: 'Need manual review before applying.',
      })
      .expect(201);

    const feedbacks = await prisma.feedbackSignal.findMany();
    expect(feedbacks).toHaveLength(1);
    expect(feedbacks[0].decision).toBe(FeedbackDecision.BAD_MATCH);
  });

  it('filtra ubicaciones explicitas fuera del perfil aunque el titulo matchee', async () => {
    process.env.GREENHOUSE_BOARD_TOKENS = 'geo-filter';
    mockGreenhouseFetch({
      title: 'Full Stack Developer (JavaScript + Python) (Remote, Full-Time), PK [UJ01]',
      email: 'jobs@geo-filter.dev',
      content: 'Frontend and React role with TypeScript support. Please email jobs@geo-filter.dev',
      location: 'Pakistan',
    });

    const agent = await loginAs(demoUser.email, 'Demo1234!');

    await agent
      .post('/search-profiles')
      .send({
        name: 'Frontend Latam',
        roleTargets: ['frontend developer', 'full stack developer'],
        keywords: ['react', 'typescript', 'javascript'],
        locations: ['latam', 'argentina'],
        remotePolicy: RemotePolicy.ANY,
        dailyLimit: 20,
        sources: ['GREENHOUSE'],
      })
      .expect(201);

    const batchResponse = await agent.post('/opportunities/run-discovery').expect(201);
    expect(batchResponse.body.inserted).toBe(0);
    expect(batchResponse.body.filteredOutByScore).toBe(1);

    const listedResponse = await agent.get('/opportunities').expect(200);
    expect(listedResponse.body.items).toHaveLength(0);
  });

  it('no degrada a UNKNOWN un mismatch geografico explicito solo por ser remote global', async () => {
    process.env.GREENHOUSE_BOARD_TOKENS = 'geo-global-filter';
    mockGreenhouseFetch({
      title: 'Frontend Developer (Remote, Worldwide)',
      email: 'jobs@geo-global-filter.dev',
      content:
        'React and TypeScript role open globally. Candidates must be located in Pakistan. Please email jobs@geo-global-filter.dev',
      location: 'Pakistan',
    });

    const agent = await loginAs(demoUser.email, 'Demo1234!');

    await agent
      .post('/search-profiles')
      .send({
        name: 'Frontend Latam',
        roleTargets: ['frontend developer'],
        keywords: ['react', 'typescript'],
        locations: ['latam', 'argentina'],
        remotePolicy: RemotePolicy.ANY,
        dailyLimit: 20,
        sources: ['GREENHOUSE'],
      })
      .expect(201);

    const batchResponse = await agent.post('/opportunities/run-discovery').expect(201);
    expect(batchResponse.body.inserted).toBe(1);

    const dismissedResponse = await agent
      .get('/opportunities')
      .query({ status: 'DISMISSED' })
      .expect(200);

    expect(dismissedResponse.body.items).toHaveLength(1);
    expect(dismissedResponse.body.items[0].workflowDecision).toBe('DISMISSED_POLICY');
    expect(dismissedResponse.body.items[0].matchingSummary.eligibility).toBe('FAIL');
    expect(dismissedResponse.body.items[0].matchingSummary.eligibilityReasons).toContain('geo_mismatch');
  });

  it('detecta ciudades conocidas fuera de latam como mismatch geografico explicito', async () => {
    process.env.GREENHOUSE_BOARD_TOKENS = 'geo-city-filter';
    mockGreenhouseFetch({
      title: 'Frontend Developer (Remote, Worldwide)',
      email: 'jobs@geo-city-filter.dev',
      content:
        'React and TypeScript role open globally. Candidates must be located in Kolkata. Please email jobs@geo-city-filter.dev',
      location: 'Kolkata',
    });

    const agent = await loginAs(demoUser.email, 'Demo1234!');

    await agent
      .post('/search-profiles')
      .send({
        name: 'Frontend Latam',
        roleTargets: ['frontend developer'],
        keywords: ['react', 'typescript'],
        locations: ['latam', 'argentina'],
        remotePolicy: RemotePolicy.ANY,
        dailyLimit: 20,
        sources: ['GREENHOUSE'],
      })
      .expect(201);

    await agent.post('/opportunities/run-discovery').expect(201);

    const dismissedResponse = await agent
      .get('/opportunities')
      .query({ status: 'DISMISSED' })
      .expect(200);

    expect(dismissedResponse.body.items).toHaveLength(1);
    expect(dismissedResponse.body.items[0].matchingSummary.eligibilityReasons).toContain('geo_mismatch');
  });

  it('no usa paises mencionados en la descripcion para pisar una ubicacion explicita', async () => {
    process.env.GREENHOUSE_BOARD_TOKENS = 'geo-description-filter';
    mockGreenhouseFetch({
      title: 'Systems Administrator',
      email: 'jobs@geo-description-filter.dev',
      content:
        'This role partners with teams in Colombia and Brazil, but the job location is Remote - Canada. Please email jobs@geo-description-filter.dev',
      location: 'Remote - Canada',
    });

    const agent = await loginAs(demoUser.email, 'Demo1234!');

    await agent
      .post('/search-profiles')
      .send({
        name: 'Frontend Latam',
        roleTargets: ['frontend developer'],
        keywords: ['react', 'typescript'],
        locations: ['latam', 'argentina'],
        remotePolicy: RemotePolicy.ANY,
        dailyLimit: 20,
        sources: ['GREENHOUSE'],
      })
      .expect(201);

    await agent.post('/opportunities/run-discovery').expect(201);

    const dismissedResponse = await agent
      .get('/opportunities')
      .query({ status: 'DISMISSED' })
      .expect(200);

    expect(dismissedResponse.body.items).toHaveLength(1);
    expect(dismissedResponse.body.items[0].matchingSummary.eligibilityReasons).toContain('geo_mismatch');
  });

  it('descarta roles full stack cuando el perfil solo busca frontend', async () => {
    process.env.GREENHOUSE_BOARD_TOKENS = 'role-filter';
    mockGreenhouseFetch({
      title: 'Full-Stack Developer Node.js, React',
      email: 'jobs@role-filter.dev',
      content: 'Remote role in Chile using React and TypeScript. Please email jobs@role-filter.dev',
      location: 'Chile',
    });

    const agent = await loginAs(demoUser.email, 'Demo1234!');

    await agent
      .post('/search-profiles')
      .send({
        name: 'Frontend Latam',
        roleTargets: ['frontend developer', 'react developer', 'desarrollador frontend'],
        keywords: ['react', 'typescript'],
        locations: ['latam', 'argentina'],
        remotePolicy: RemotePolicy.ANY,
        dailyLimit: 20,
        sources: ['GREENHOUSE'],
      })
      .expect(201);

    await agent.post('/opportunities/run-discovery').expect(201);

    const dismissedResponse = await agent
      .get('/opportunities')
      .query({ status: 'DISMISSED' })
      .expect(200);

    expect(dismissedResponse.body.items).toHaveLength(1);
    expect(dismissedResponse.body.items[0].matchingSummary.eligibility).toBe('FAIL');
    expect(dismissedResponse.body.items[0].matchingSummary.eligibilityReasons).toContain('role_mismatch');
  });

  it('no promueve titulos genericos solo por compartir developer con el target', async () => {
    process.env.GREENHOUSE_BOARD_TOKENS = 'generic-title-filter';
    mockGreenhouseFetch({
      title: 'Android Developer',
      email: 'jobs@generic-title-filter.dev',
      content: 'Remote role in Chile using React and TypeScript. Please email jobs@generic-title-filter.dev',
      location: 'Chile',
    });

    const agent = await loginAs(demoUser.email, 'Demo1234!');

    await agent
      .post('/search-profiles')
      .send({
        name: 'Frontend Latam',
        roleTargets: ['frontend developer', 'react developer'],
        keywords: ['react', 'typescript'],
        locations: ['latam'],
        remotePolicy: RemotePolicy.ANY,
        dailyLimit: 20,
        sources: ['GREENHOUSE'],
      })
      .expect(201);

    await agent.post('/opportunities/run-discovery').expect(201);

    const listedResponse = await agent.get('/opportunities').expect(200);
    expect(listedResponse.body.items).toHaveLength(1);
    expect(listedResponse.body.items[0].matchingSummary.targetMatchTier).toBe(1);
    expect(listedResponse.body.items[0].matchingSummary.eligibility).toBe('UNKNOWN');
    expect(listedResponse.body.items[0].workflowDecision).toBe('LOW_PRIORITY');
  });

  it('prioriza primero ubicacion exacta, luego region y despues remoto ambiguo', async () => {
    process.env.GREENHOUSE_BOARD_TOKENS = 'rank-geo';
    mockGreenhouseJobsFetch([
      {
        id: 201,
        title: 'Senior Frontend Developer',
        email: null,
        content: 'React and TypeScript role in Argentina.',
        location: 'Argentina',
      },
      {
        id: 202,
        title: 'Frontend Developer',
        email: null,
        content: 'React and TypeScript role in Chile.',
        location: 'Chile',
      },
      {
        id: 203,
        title: 'Software Engineer',
        email: null,
        content: 'React and TypeScript role open worldwide.',
        location: 'Remote',
      },
    ]);

    const agent = await loginAs(demoUser.email, 'Demo1234!');

    await agent
      .post('/search-profiles')
      .send({
        name: 'Frontend Latam',
        roleTargets: ['frontend developer', 'react developer'],
        keywords: ['react', 'typescript'],
        locations: ['argentina', 'latam'],
        remotePolicy: RemotePolicy.ANY,
        dailyLimit: 20,
        sources: ['GREENHOUSE'],
      })
      .expect(201);

    await agent.post('/opportunities/run-discovery').expect(201);

    const response = await agent
      .get('/opportunities')
      .query({ statuses: 'QUALIFIED,DISCOVERED' })
      .expect(200);

    expect(response.body.items.map((item: { title: string }) => item.title)).toEqual([
      'Senior Frontend Developer',
      'Frontend Developer',
      'Software Engineer',
    ]);
    expect(response.body.items[0].matchingSummary.locationTier).toBe(5);
    expect(response.body.items[1].matchingSummary.locationTier).toBe(4);
    expect(response.body.items[2].matchingSummary.locationTier).toBe(3);
  });

  it('prioriza match de target sobre match solo por keywords', async () => {
    process.env.GREENHOUSE_BOARD_TOKENS = 'rank-target';
    mockGreenhouseJobsFetch([
      {
        id: 301,
        title: 'Frontend Developer',
        email: null,
        content: 'React and TypeScript role in Chile.',
        location: 'Chile',
      },
      {
        id: 302,
        title: 'Software Engineer',
        email: null,
        content: 'Remote role in Chile using React and TypeScript.',
        location: 'Chile',
      },
    ]);

    const agent = await loginAs(demoUser.email, 'Demo1234!');

    await agent
      .post('/search-profiles')
      .send({
        name: 'Frontend Latam',
        roleTargets: ['frontend developer', 'react developer'],
        keywords: ['react', 'typescript'],
        locations: ['latam'],
        remotePolicy: RemotePolicy.ANY,
        dailyLimit: 20,
        sources: ['GREENHOUSE'],
      })
      .expect(201);

    await agent.post('/opportunities/run-discovery').expect(201);

    const response = await agent
      .get('/opportunities')
      .query({ statuses: 'QUALIFIED,DISCOVERED' })
      .expect(200);

    expect(response.body.items.map((item: { title: string }) => item.title)).toEqual([
      'Frontend Developer',
      'Software Engineer',
    ]);
    expect(response.body.items[0].matchingSummary.targetMatchTier).toBeGreaterThan(
      response.body.items[1].matchingSummary.targetMatchTier,
    );
  });

  it('usa el mismo ranking generico para perfiles distintos de frontend', async () => {
    process.env.GREENHOUSE_BOARD_TOKENS = 'rank-generic-role';
    mockGreenhouseJobsFetch([
      {
        id: 401,
        title: 'QA Automation Engineer',
        email: null,
        content: 'Cypress and Playwright role in Argentina.',
        location: 'Argentina',
      },
      {
        id: 402,
        title: 'Software Engineer',
        email: null,
        content: 'Cypress and Playwright role in Argentina.',
        location: 'Argentina',
      },
    ]);

    const agent = await loginAs(demoUser.email, 'Demo1234!');

    await agent
      .post('/search-profiles')
      .send({
        name: 'QA Automation',
        roleTargets: ['qa automation engineer'],
        keywords: ['cypress', 'playwright'],
        locations: ['argentina'],
        remotePolicy: RemotePolicy.ANY,
        dailyLimit: 20,
        sources: ['GREENHOUSE'],
      })
      .expect(201);

    await agent.post('/opportunities/run-discovery').expect(201);

    const response = await agent
      .get('/opportunities')
      .query({ statuses: 'QUALIFIED,DISCOVERED' })
      .expect(200);

    expect(response.body.items.map((item: { title: string }) => item.title)).toEqual([
      'QA Automation Engineer',
      'Software Engineer',
    ]);
  });
});

function mockGreenhouseFetch({
  title,
  email,
  content,
  location = 'Remote',
}: {
  title: string;
  email: string | null;
  content: string;
  location?: string;
}) {
  return mockGreenhouseJobsFetch([
    {
      id: 101,
      title,
      email,
      content,
      location,
    },
  ]);
}

function mockGreenhouseJobsFetch(
  jobs: Array<{
    id: number;
    title: string;
    email: string | null;
    content: string;
    location?: string;
  }>,
) {
  jest.spyOn(global, 'fetch').mockImplementation(async () => {
    const payload = {
      jobs: jobs.map((job) => ({
        id: job.id,
        absolute_url: `https://boards.greenhouse.io/acme/jobs/${job.id}`,
        title: job.title,
        updated_at: '2026-04-01T10:00:00.000Z',
        content: job.content,
        location: { name: job.location ?? 'Remote' },
        metadata: job.email ? [{ name: 'apply', value: job.email }] : [],
      })),
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}
