import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpportunitiesService } from './opportunities.service';

@Injectable()
export class DiscoverySchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscoverySchedulerService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly opportunitiesService: OpportunitiesService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.DISCOVERY_BATCH_ENABLED !== 'true') {
      return;
    }

    this.timer = setInterval(() => {
      void this.runIfScheduled();
    }, 60 * 60 * 1000);

    void this.runIfScheduled();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async runIfScheduled() {
    const now = new Date();
    const targetHour = Number(process.env.DISCOVERY_BATCH_HOUR_UTC ?? 12);

    if (now.getUTCHours() !== targetHour) {
      return;
    }

    const currentWindowStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), targetHour, 0, 0, 0),
    );
    const currentWindowEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), targetHour, 59, 59, 999),
    );
    const existingSuccess = await this.prisma.discoveryRun.findFirst({
      where: {
        status: 'SUCCESS',
        startedAt: {
          gte: currentWindowStart,
          lte: currentWindowEnd,
        },
      },
    });

    if (existingSuccess) {
      return;
    }

    try {
      await this.opportunitiesService.runDiscoveryBatchForAllUsers();
    } catch (error) {
      this.logger.warn(`Discovery batch failed: ${toErrorMessage(error)}`);
    }
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}
