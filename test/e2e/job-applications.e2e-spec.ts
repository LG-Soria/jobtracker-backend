import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { Role, User } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { JWT_COOKIE_NAME } from '../../src/auth/auth.constants';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JobStatus } from '@prisma/client';

describe('JobApplications E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let demoUser: User;
  let adminUser: User;

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
    await prisma.jobApplicationHistory.deleteMany();
    await prisma.jobApplication.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const loginAs = async (email: string, password: string) => {
    const agent = request.agent(app.getHttpServer());
    const response = await agent.post('/auth/login').send({ email, password });
    return { agent, response };
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
    await prisma.jobApplicationHistory.deleteMany();
    await prisma.jobApplication.deleteMany();
    await prisma.user.deleteMany();

    demoUser = await seedUser('demo@jobtracker.com', 'Demo1234!', Role.DEMO);
    adminUser = await seedUser('admin@jobtracker.com', 'Admin1234!', Role.USER);
  };

  const createJobApplicationForUser = async (
    userId: string,
    overrides: Partial<{
      company: string;
      position: string;
      source: string;
      applicationDate: string;
      status: JobStatus;
      notes?: string;
      jobUrl?: string;
      createdAt?: Date;
    }> = {},
  ) => {
    const baseDate = overrides.applicationDate ?? '2025-01-20';
    return prisma.jobApplication.create({
      data: {
        company: overrides.company ?? 'Wayne Tech',
        position: overrides.position ?? 'Backend NestJS',
        source: overrides.source ?? 'LinkedIn',
        applicationDate: new Date(baseDate),
        status: overrides.status ?? JobStatus.ENVIADA,
        notes: overrides.notes,
        jobUrl: overrides.jobUrl,
        userId,
        createdAt: overrides.createdAt,
      },
    });
  };

  describe('Auth', () => {
    it('permite login y consulta del perfil con cookie httpOnly', async () => {
      const { agent, response: loginResponse } = await loginAs(
        demoUser.email,
        'Demo1234!',
      );

      expect(loginResponse.status).toBe(200);
      const setCookie = loginResponse.get('set-cookie') ?? [];
      expect(setCookie.some((cookie) => cookie.startsWith(`${JWT_COOKIE_NAME}=`))).toBe(true);

      const meResponse = await agent.get('/auth/me').expect(200);
      expect(meResponse.body.email).toBe(demoUser.email);
    });
  });

  describe('Job applications', () => {
    it('crea y lista postulaciones atadas al usuario autenticado', async () => {
      const { agent } = await loginAs(demoUser.email, 'Demo1234!');

  const payload = {
  company: 'Wayne Tech',
  position: 'Backend NestJS',
  source: 'LinkedIn',
  applicationDate: '2025-01-20',
  status: JobStatus.ENVIADA,
  notes: 'Enviada via recruiter',
  jobUrl: 'https://jobs.example.com/wayne-tech/backend',
};

      const createResponse = await agent
        .post('/job-applications')
        .send(payload)
        .expect(201);

      expect(createResponse.body.id).toBeDefined();
      expect(createResponse.body.userId).toBe(demoUser.id);

      const listResponse = await agent.get('/job-applications').expect(200);
      expect(listResponse.body.meta).toMatchObject({
        page: 1,
        limit: 20,
      });
      const created = listResponse.body.items.find(
        (item: any) => item.id === createResponse.body.id,
      );

      expect(created).toBeDefined();
      expect(created.userId).toBe(demoUser.id);
    });

    it('no expone postulaciones de otro usuario (aislamiento multi-tenant)', async () => {
      const markerTitle = 'SHOULD_NOT_BE_VISIBLE';

      const { agent: demoAgent } = await loginAs(demoUser.email, 'Demo1234!');
      const demoCreateResponse = await demoAgent
  .post('/job-applications')
  .send({
    company: 'Hidden Corp',
    position: markerTitle,
    source: 'Referral',
    applicationDate: '2025-01-19',
    status: JobStatus.EN_PROCESO,
  })
  .expect(201);

      await demoAgent.post('/auth/logout');

      const { agent: adminAgent } = await loginAs(adminUser.email, 'Admin1234!');
      const adminListResponse = await adminAgent.get('/job-applications').expect(200);

      const seenByAdmin = adminListResponse.body.items.some(
        (item: any) => item.id === demoCreateResponse.body.id || item.position === markerTitle,
      );

      expect(seenByAdmin).toBe(false);
    });

    it('devuelve meta de paginacion y respeta el limite solicitado', async () => {
      await createJobApplicationForUser(demoUser.id, { company: 'Acme Corp A' });
      await createJobApplicationForUser(demoUser.id, { company: 'Acme Corp B' });
      await createJobApplicationForUser(demoUser.id, { company: 'Acme Corp C' });
      await createJobApplicationForUser(demoUser.id, { company: 'Acme Corp D' });
      await createJobApplicationForUser(demoUser.id, { company: 'Acme Corp E' });

      const { agent } = await loginAs(demoUser.email, 'Demo1234!');

      const listResponse = await agent
        .get('/job-applications')
        .query({ page: 2, limit: 2 })
        .expect(200);

      expect(listResponse.body.meta).toMatchObject({
        page: 2,
        limit: 2,
        total: 5,
        totalPages: 3,
      });
      expect(listResponse.body.items).toHaveLength(2);
    });

    it('filtra por texto en company o position con q y es case-insensitive', async () => {
      await createJobApplicationForUser(demoUser.id, { company: 'Acme Labs', position: 'Backend' });
      await createJobApplicationForUser(demoUser.id, { company: 'Beta Corp', position: 'Acme Manager' });
      await createJobApplicationForUser(demoUser.id, { company: 'Gamma Corp', position: 'Data Engineer' });

      const { agent } = await loginAs(demoUser.email, 'Demo1234!');
      const listResponse = await agent
        .get('/job-applications')
        .query({ q: 'acme', limit: 10 })
        .expect(200);

      expect(listResponse.body.meta.total).toBe(2);
      expect(listResponse.body.items.every((item: any) => /acme/i.test(item.company) || /acme/i.test(item.position))).toBe(true);
    });

    it('combina q + paginacion respetando el aislamiento multi-tenant', async () => {
      await createJobApplicationForUser(demoUser.id, { company: 'Focus Tech', position: 'QA' });
      await createJobApplicationForUser(demoUser.id, { company: 'Hidden Search', position: 'Search Specialist' });
      await createJobApplicationForUser(adminUser.id, { company: 'Hidden Search', position: 'Lead' });

      const { agent } = await loginAs(demoUser.email, 'Demo1234!');
      const listResponse = await agent
        .get('/job-applications')
        .query({ q: 'hidden', limit: 5, page: 1 })
        .expect(200);

      expect(listResponse.body.items.length).toBe(1);
      expect(listResponse.body.items[0].company).toBe('Hidden Search');
      expect(listResponse.body.meta.total).toBe(1);
    });

    it('devuelve detalle individual respetando el aislamiento por usuario', async () => {
      const demoApplication = await createJobApplicationForUser(demoUser.id, {
        company: 'Detail Corp',
        position: 'SSR Backend',
        status: JobStatus.ENTREVISTA,
      });

      const { agent } = await loginAs(demoUser.email, 'Demo1234!');
      const detailResponse = await agent.get(`/job-applications/${demoApplication.id}`).expect(200);

      expect(detailResponse.body.id).toBe(demoApplication.id);
      expect(detailResponse.body.company).toBe('Detail Corp');
      expect(detailResponse.body.status).toBe(JobStatus.ENTREVISTA);

      const { agent: adminAgent } = await loginAs(adminUser.email, 'Admin1234!');
      await adminAgent.get(`/job-applications/${demoApplication.id}`).expect(404);
    });

    it('registra evento CREATED en el historial al crear la postulacion', async () => {
      const { agent } = await loginAs(demoUser.email, 'Demo1234!');

      const payload = {
        company: 'Wayne Tech',
        position: 'Backend NestJS',
        source: 'LinkedIn',
        applicationDate: '2025-01-20',
        status: JobStatus.ENVIADA,
      };

      const createResponse = await agent.post('/job-applications').send(payload).expect(201);
      const historyResponse = await agent
        .get(`/job-applications/${createResponse.body.id}/history`)
        .expect(200);

      expect(Array.isArray(historyResponse.body)).toBe(true);
      expect(historyResponse.body).toHaveLength(1);
      expect(historyResponse.body[0]).toMatchObject({
        jobApplicationId: createResponse.body.id,
        type: 'CREATED',
      });
      expect(historyResponse.body[0].meta).toEqual({});
    });

    it('agrega evento STATUS_CHANGED con from/to al confirmar el cambio de estado', async () => {
      const { agent } = await loginAs(demoUser.email, 'Demo1234!');

      const createResponse = await agent
        .post('/job-applications')
        .send({
          company: 'Timeline Corp',
          position: 'Frontend',
          source: 'Referral',
          applicationDate: '2025-01-21',
          status: JobStatus.ENVIADA,
        })
        .expect(201);

      await agent
        .patch(`/job-applications/${createResponse.body.id}`)
        .send({ status: JobStatus.EN_PROCESO })
        .expect(200);

      const historyResponse = await agent
        .get(`/job-applications/${createResponse.body.id}/history`)
        .expect(200);

      expect(historyResponse.body).toHaveLength(2);
      const [created, statusChanged] = historyResponse.body;

      expect(created.type).toBe('CREATED');
      expect(statusChanged.type).toBe('STATUS_CHANGED');
      expect(statusChanged.meta).toMatchObject({
        from: JobStatus.ENVIADA,
        to: JobStatus.EN_PROCESO,
      });
      expect(new Date(created.createdAt).getTime()).toBeLessThanOrEqual(
        new Date(statusChanged.createdAt).getTime(),
      );
    });

    it('no expone el historial de otra persona', async () => {
      const demoApplication = await createJobApplicationForUser(demoUser.id);
      const { agent: adminAgent } = await loginAs(adminUser.email, 'Admin1234!');

      await adminAgent.get(`/job-applications/${demoApplication.id}/history`).expect(404);
    });
  });
});
