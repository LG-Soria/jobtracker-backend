"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const argon2 = require("argon2");
const prisma_service_1 = require("../src/prisma/prisma.service");
const prisma = new prisma_service_1.PrismaService();
const seedUsers = [
    {
        email: 'demo@jobtracker.com',
        password: 'Demo1234!',
        role: client_1.Role.DEMO,
        applications: [
            {
                company: 'Acme Corp',
                position: 'Frontend Developer',
                source: 'LinkedIn',
                applicationDate: '2025-01-18',
                status: client_1.JobStatus.EN_PROCESO,
                notes: 'Contacto inicial de recruiter, esperando agenda de entrevista tecnica.',
                jobUrl: 'https://www.linkedin.com/jobs/view/frontend-developer-acme',
            },
            {
                company: 'Mural',
                position: 'Senior React Engineer',
                source: 'GetOnBoard',
                applicationDate: '2025-01-16',
                status: client_1.JobStatus.ENTREVISTA,
                notes: 'Agendada tecnica en 2 pasos. Preparar ejemplos de UI con SSR.',
                jobUrl: 'https://www.getonbrd.com/jobs/frontend-mural',
            },
            {
                company: 'Mercado Libre',
                position: 'Backend Node.js',
                source: 'LinkedIn',
                applicationDate: '2025-01-14',
                status: client_1.JobStatus.ENVIADA,
                notes: 'Adjunte portfolio y repositorios de microservicios.',
            },
            {
                company: 'Rappi',
                position: 'Fullstack TypeScript',
                source: 'Referral',
                applicationDate: '2025-01-10',
                status: client_1.JobStatus.EN_PROCESO,
                notes: 'Contactar a Lucia (recruiter) si no responden en 72h.',
                jobUrl: 'https://rappi.com/careers/fullstack',
            },
            {
                company: 'Nubank',
                position: 'Product Engineer',
                source: 'GetOnBoard',
                applicationDate: '2025-01-06',
                status: client_1.JobStatus.ENTREVISTA,
                notes: 'Casos de estudio enviados. Esperando feedback.',
            },
            {
                company: 'Uala',
                position: 'QA Automation',
                source: 'LinkedIn',
                applicationDate: '2024-12-28',
                status: client_1.JobStatus.SIN_RESPUESTA,
                notes: 'Aplicacion enviada con CV actualizado y cover letter.',
            },
            {
                company: 'PedidosYa',
                position: 'Engineering Manager',
                source: 'Referral',
                applicationDate: '2024-12-22',
                status: client_1.JobStatus.EN_PROCESO,
                notes: 'Solicitar feedback sobre challenge de liderazgo.',
            },
            {
                company: 'Globant',
                position: 'UX Researcher',
                source: 'LinkedIn',
                applicationDate: '2024-12-18',
                status: client_1.JobStatus.RECHAZADA,
                notes: 'Feedback: buscan mayor seniority en discovery cuantitativo.',
            },
            {
                company: 'LaLiga Tech',
                position: 'Data Analyst',
                source: 'Indeed',
                applicationDate: '2024-12-10',
                status: client_1.JobStatus.SIN_RESPUESTA,
                jobUrl: 'https://www.indeed.com/viewjob-laligatech-data-analyst',
            },
            {
                company: 'Ripio',
                position: 'Platform Engineer',
                source: 'Referral',
                applicationDate: '2024-12-02',
                status: client_1.JobStatus.EN_PROCESO,
                notes: 'Se envio repo con IaC. Revisar follow-up en 1 semana.',
            },
            {
                company: 'Despegar',
                position: 'Frontend SSR',
                source: 'GetOnBoard',
                applicationDate: '2024-11-20',
                status: client_1.JobStatus.RECHAZADA,
                notes: 'Feedback: reintentar en 6 meses con foco en performance.',
            },
            {
                company: 'Bitso',
                position: 'Tech Lead',
                source: 'LinkedIn',
                applicationDate: '2024-11-12',
                status: client_1.JobStatus.ENVIADA,
                notes: 'Contactar a ex colega para referral.',
            },
        ],
    },
    {
        email: 'admin@jobtracker.com',
        password: 'Admin1234!',
        role: client_1.Role.USER,
        applications: [
            {
                company: 'Acme Ventures',
                position: 'Head of Engineering',
                source: 'Headhunter',
                applicationDate: '2025-01-15',
                status: client_1.JobStatus.ENTREVISTA,
                notes: 'Pitch presentado. Falta ronda con VP.',
            },
            {
                company: 'Globex',
                position: 'Backend Go',
                source: 'LinkedIn',
                applicationDate: '2025-01-08',
                status: client_1.JobStatus.ENVIADA,
                jobUrl: 'https://www.linkedin.com/jobs/view/backend-go',
            },
            {
                company: 'Stark Industries',
                position: 'Security Engineer',
                source: 'Referral',
                applicationDate: '2024-12-29',
                status: client_1.JobStatus.EN_PROCESO,
                notes: 'Esperando NDA para challenge de seguridad.',
            },
            {
                company: 'Wayne Enterprises',
                position: 'Data Lead',
                source: 'GetOnBoard',
                applicationDate: '2024-12-18',
                status: client_1.JobStatus.SIN_RESPUESTA,
            },
            {
                company: 'Hooli',
                position: 'Site Reliability Engineer',
                source: 'LinkedIn',
                applicationDate: '2024-12-05',
                status: client_1.JobStatus.RECHAZADA,
                notes: 'Se ofrecio feedback escrito.',
            },
            {
                company: 'Initech',
                position: 'Fullstack Developer',
                source: 'Indeed',
                applicationDate: '2024-11-25',
                status: client_1.JobStatus.EN_PROCESO,
                notes: 'Esperando revision de code challenge.',
            },
        ],
    },
];
function toUtcDate(date) {
    return new Date(`${date}T12:00:00Z`);
}
function getSeedMode() {
    return (process.env.SEED_MODE || 'demo').toLowerCase() === 'personal' ? 'personal' : 'demo';
}
async function upsertUser(email, password, role) {
    const passwordHash = await argon2.hash(password);
    const normalizedEmail = email.toLowerCase();
    return prisma.user.upsert({
        where: { email: normalizedEmail },
        update: { passwordHash, role },
        create: { email: normalizedEmail, passwordHash, role },
    });
}
async function seedDemoUsers() {
    for (const user of seedUsers) {
        const dbUser = await upsertUser(user.email, user.password, user.role);
        await prisma.jobApplication.deleteMany({
            where: { userId: dbUser.id },
        });
        const seedApplications = user.applications.map((app, index) => {
            var _a, _b;
            return ({
                company: app.company,
                position: app.position,
                source: app.source,
                applicationDate: toUtcDate(app.applicationDate),
                status: app.status,
                notes: (_a = app.notes) !== null && _a !== void 0 ? _a : null,
                jobUrl: (_b = app.jobUrl) !== null && _b !== void 0 ? _b : null,
                userId: dbUser.id,
                createdAt: new Date(toUtcDate(app.applicationDate).getTime() + index * 1000),
            });
        });
        if (seedApplications.length) {
            await prisma.jobApplication.createMany({ data: seedApplications });
            const createdApplications = await prisma.jobApplication.findMany({
                where: { userId: dbUser.id },
                select: { id: true, createdAt: true },
            });
            if (createdApplications.length) {
                await prisma.jobApplicationHistory.createMany({
                    data: createdApplications.map((app) => ({
                        jobApplicationId: app.id,
                        type: client_1.JobApplicationHistoryType.CREATED,
                        meta: {},
                        actorUserId: dbUser.id,
                        createdAt: app.createdAt,
                    })),
                });
            }
        }
        console.log(`Seeded DEMO user ${dbUser.email} with ${seedApplications.length} applications.`);
    }
}
async function seedPersonalUser() {
    var _a;
    const email = (_a = process.env.PERSONAL_EMAIL) === null || _a === void 0 ? void 0 : _a.trim();
    const password = process.env.PERSONAL_PASSWORD;
    if (!email || !password) {
        throw new Error('SEED_MODE=personal requiere PERSONAL_EMAIL y PERSONAL_PASSWORD.');
    }
    const dbUser = await upsertUser(email, password, client_1.Role.USER);
    console.log(`Personal user ensured: ${dbUser.email}. No applications were deleted/seeded in personal mode.`);
}
function assertSafeSeedTarget() {
    var _a;
    const url = (_a = process.env.DATABASE_URL) !== null && _a !== void 0 ? _a : '';
    const mode = (process.env.SEED_MODE || 'demo').toLowerCase();
    if (mode === 'demo' && url.includes('schema=public')) {
        throw new Error('Refusing to run DEMO seed on schema=public. Use a demo schema (e.g. schema=demo) or a separate database.');
    }
}
async function main() {
    await prisma.$connect();
    assertSafeSeedTarget();
    const mode = getSeedMode();
    if (mode === 'personal') {
        await seedPersonalUser();
    }
    else {
        await seedDemoUsers();
    }
}
main()
    .catch((error) => {
    console.error('Seed failed', error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map