// Specification: Root Nest application module.
// Wires feature modules and shared providers.

import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { JobApplicationsModule } from './job-applications/job-applications.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule, JobApplicationsModule],
})
export class AppModule {}
