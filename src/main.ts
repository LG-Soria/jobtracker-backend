// Specification: Nest application bootstrap entry point.
// Bootstraps the Nest app with global validation and CORS.

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );
console.log('DATABASE_URL:', process.env.DATABASE_URL);

  app.enableCors({
    origin: 'http://localhost:3001',
    credentials: true,
  });
  const port = process.env.PORT || 3000;
  await app.listen(port);
}

bootstrap();
