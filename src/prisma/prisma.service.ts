// Specification: Nest PrismaService wrapper for PrismaClient.
// Initializes PrismaClient as an injectable service and manages lifecycle hooks for clean shutdown.
import 'dotenv/config';
import { INestApplication, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set. Define it in .env to start the server.');
    }

    const pool = new Pool({ connectionString: databaseUrl });

    super({
      adapter: new PrismaPg(pool, { disposeExternalPool: true }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    app.enableShutdownHooks();
  }
}
