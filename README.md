# Backend auth (NestJS + Prisma)

## Setup rapido
- `npm install`
- Migraciones: `npx prisma migrate dev` (o `npm run prisma:migrate`) aplica la migracion nueva `20251219190000_add_user_ownership`
- Generar cliente: `npx prisma generate`
- Seed de usuarios (demo/admin): `npx prisma db seed`
- Arrancar: `npm run start:dev` (API en `http://localhost:3000`)

> CORS esta habilitado con `origin: http://localhost:3001` y `credentials: true` para que el frontend Next (puerto 3001) envie/reciba cookies.

## Endpoints de auth
- `POST /auth/login` `{ email, password }` valida credenciales, firma JWT `{ sub, email, role }`, setea cookie httpOnly `auth_token` (`sameSite:lax`, `secure:false` en dev) por 7 dias.
- `POST /auth/logout` limpia cookie.
- `GET /auth/me` requiere la cookie, devuelve `{ id, email, role }`.

## Usuarios seed
- Demo: `demo@jobtracker.com` / `Demo1234!`
- Admin: `admin@jobtracker.com` / `Admin1234!`

## JobStatus normalizado
- Prisma/DB usan ahora valores técnicos sin espacios: `ENVIADA | EN_PROCESO | ENTREVISTA | RECHAZADA | SIN_RESPUESTA` (migración `20251219223000_job_status_enum_normalized`).
- Los DTO aceptan el enum técnico; para compatibilidad se normalizan strings con espacios o guiones (`en proceso`, `en-proceso`, `EN_PROCESO`) antes de validar y persistir.
- PrismaService ya no mapea a valores con espacio; los enums en DB y Prisma coinciden 1:1.
- Frontend debe mapear el enum técnico a labels de UI (`En proceso`, etc.). TODO: actualizar `frontend/src/types/jobApplication.ts` y adaptadores de UI para usar el nuevo enum + labels.
- Para restablecer solo el esquema de tests: `npx dotenv -e .env.test -- prisma migrate reset --force --skip-seed` (usa `schema=test` definido en `.env.test`).

## Ejemplos curl (cookies)
Login (guarda cookie en `cookie.txt`):
```bash
curl -i -c cookie.txt ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"demo@jobtracker.com\",\"password\":\"Demo1234!\"}" ^
  http://localhost:3000/auth/login
```

Perfil usando la cookie:
```bash
curl -b cookie.txt http://localhost:3000/auth/me
```

Logout (opcional, limpia cookie):
```bash
curl -b cookie.txt http://localhost:3000/auth/logout
```

## Multi-tenant (data ownership)
- JobApplication ahora tiene `userId` FK a `User` con `onDelete: CASCADE`; User tiene `applications`.
- Los controladores usan `JwtAuthGuard` y `req.user.sub` para setear userId en create, filtrar en list/find y validar ownership antes de update/delete; el cliente nunca envia userId.
- Migracion `20251219190000_add_user_ownership` agrega `Role`, `User`, la FK, index de userId y backfill de aplicaciones existentes al usuario `demo@jobtracker.com` (hash precalculado) para evitar data loss.
- Motivo: aunque hoy sea single-user, esto previene filtraciones cruzadas si se suman cuentas nuevas o si se reusa la base entre testers/staging.
- Para probar rapido: con usuarios demo y admin, crear una postulacion con cada uno y verificar que el otro usuario recibe 404 al pedir `GET /job-applications/:id`, al actualizar o al borrar. Esto se puede automatizar en un test e2e autenticando con cada cookie.

## Tests e2e (flujos criticos)
- Cobertura: login via cookie httpOnly + `GET /auth/me`; crear y listar `POST/GET /job-applications` validando `userId`; aislamiento multi-tenant (un usuario no ve la postulación del otro).
- Son pocos pero estrategicos: ejercitan auth real, CRUD basico y el guardado/filtrado por `userId`, que son los riesgos mayores de regresion.
- Correr: `npm run test:e2e` (usa Jest + Supertest). Ejecuta en modo `runInBand` y limpia `User` y `JobApplication` antes de cada suite para dejar el estado consistente.
- Usa `DATABASE_URL` de `.env.test` (`schema=test`) para no tocar datos dev; si hace falta resetear, ejecutar `npx dotenv -e .env.test -- prisma migrate reset --force --skip-seed`.
