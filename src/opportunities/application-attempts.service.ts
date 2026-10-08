import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApplicationAttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.applicationAttempt.findMany({
      where: { userId },
      include: {
        cvVariant: true,
        opportunity: {
          select: {
            id: true,
            title: true,
            company: true,
            source: true,
            sourceUrl: true,
            status: true,
          },
        },
      },
      orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }
}
