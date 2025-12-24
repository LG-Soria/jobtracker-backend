// Specification: Service handling job application domain logic with Prisma.
// Handles CRUD operations for job applications and validates status against the enum.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  JobApplicationHistory as PrismaJobApplicationHistory,
  JobApplicationHistoryType as PrismaJobApplicationHistoryType,
  JobApplication as PrismaJobApplication,
  JobStatus as PrismaJobStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateJobApplicationDto,
  JobStatus,
  normalizeJobStatusInput,
} from './dto/create-job-application.dto';
import { ListJobApplicationsQueryDto } from './dto/list-job-applications.dto';
import { UpdateJobApplicationDto } from './dto/update-job-application.dto';

type ListFilters = ListJobApplicationsQueryDto;

@Injectable()
export class JobApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, payload: CreateJobApplicationDto) {
    const applicationDate = this.toDate(payload.applicationDate);
    this.validateSalaryRange(payload.salaryMin, payload.salaryMax);

    const created = await this.prisma.$transaction(async (tx) => {
      const jobApplication = await tx.jobApplication.create({
        data: {
          company: payload.company,
          position: payload.position,
          source: payload.source,
          notes: payload.notes,
          jobUrl: payload.jobUrl,
          salaryMin: payload.salaryMin,
          salaryMax: payload.salaryMax,
          salaryCurrency: payload.salaryCurrency,
          salaryPeriod: payload.salaryPeriod,
          salaryType: payload.salaryType,
          applicationDate,
          status: this.toPrismaStatus(payload.status),
          userId,
        },
      });

      await tx.jobApplicationHistory.create({
        data: {
          jobApplicationId: jobApplication.id,
          type: PrismaJobApplicationHistoryType.CREATED,
          meta: {},
          actorUserId: userId,
        },
      });

      return jobApplication;
    });

    return this.mapToApiStatus(created);
  }

  async findAll(userId: string, filters?: ListFilters) {
    const where: Prisma.JobApplicationWhereInput = {
      userId,
    };

    if (filters?.status) {
      where.status = this.toPrismaStatus(filters.status);
    }

    if (filters?.fromDate || filters?.toDate) {
      where.applicationDate = {};
      if (filters.fromDate) {
        where.applicationDate.gte = this.toDate(filters.fromDate);
      }
      if (filters.toDate) {
        where.applicationDate.lte = this.toDate(filters.toDate);
      }
    }

    const search = filters?.q?.trim();
    if (search) {
      where.OR = [
        { company: { contains: search, mode: 'insensitive' } },
        { position: { contains: search, mode: 'insensitive' } },
      ];
    }

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.jobApplication.findMany({
        where,
        orderBy: [
          { createdAt: 'desc' },
          { applicationDate: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.jobApplication.count({ where }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      items: items.map(this.mapToApiStatus),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async findOne(userId: string, id: string) {
    const application = await this.assertOwnership(id, userId);
    return this.mapToApiStatus(application);
  }

  async update(userId: string, id: string, data: UpdateJobApplicationDto) {
    const existing = await this.assertOwnership(id, userId);

    const updateData: Prisma.JobApplicationUpdateInput = {};

    if (data.salaryMin !== undefined || data.salaryMax !== undefined) {
      const nextSalaryMin = data.salaryMin ?? existing.salaryMin ?? undefined;
      const nextSalaryMax = data.salaryMax ?? existing.salaryMax ?? undefined;
      this.validateSalaryRange(nextSalaryMin, nextSalaryMax);
    }

    if (data.company !== undefined) updateData.company = data.company;
    if (data.position !== undefined) updateData.position = data.position;
    if (data.source !== undefined) updateData.source = data.source;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.jobUrl !== undefined) updateData.jobUrl = data.jobUrl;
    if (data.salaryMin !== undefined) updateData.salaryMin = data.salaryMin;
    if (data.salaryMax !== undefined) updateData.salaryMax = data.salaryMax;
    if (data.salaryCurrency !== undefined) updateData.salaryCurrency = data.salaryCurrency;
    if (data.salaryPeriod !== undefined) updateData.salaryPeriod = data.salaryPeriod;
    if (data.salaryType !== undefined) updateData.salaryType = data.salaryType;

    if (data.status !== undefined) {
      updateData.status = this.toPrismaStatus(data.status);
    }

    if (data.applicationDate !== undefined) {
      updateData.applicationDate = this.toDate(data.applicationDate);
    }

    const newStatus = updateData.status as PrismaJobStatus | undefined;
    const statusChanged = newStatus !== undefined && newStatus !== existing.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedApplication = await tx.jobApplication.update({
        where: { id },
        data: updateData,
      });

      if (statusChanged) {
        await tx.jobApplicationHistory.create({
          data: {
            jobApplicationId: id,
            type: PrismaJobApplicationHistoryType.STATUS_CHANGED,
            meta: {
              from: existing.status,
              to: updatedApplication.status,
            },
            actorUserId: userId,
          },
        });
      }

      return updatedApplication;
    });

    return this.mapToApiStatus(updated);
  }

  async remove(userId: string, id: string) {
    await this.assertOwnership(id, userId);
    const removed = await this.prisma.jobApplication.delete({
      where: { id },
    });
    return this.mapToApiStatus(removed);
  }

  async getHistory(userId: string, id: string) {
    await this.assertOwnership(id, userId);
    const items = await this.prisma.jobApplicationHistory.findMany({
      where: { jobApplicationId: id },
      orderBy: { createdAt: 'asc' },
    });

    return items.map((entry) => this.mapHistory(entry));
  }

  private async assertOwnership(id: string, userId: string) {
    const owned = await this.prisma.jobApplication.findFirst({
      where: { id, userId },
    });

    if (!owned) {
      throw new NotFoundException('Job application not found');
    }
    return owned;
  }

  // DTO (espanol) -> Prisma enum (EN_PROCESO, etc.)
  private toPrismaStatus(status: JobStatus | PrismaJobStatus | string): PrismaJobStatus {
    const normalized = normalizeJobStatusInput(status);
    if (!normalized) throw new BadRequestException(`Estado invalido: "${status}"`);
    return normalized as PrismaJobStatus;
  }

  // Prisma enum -> DTO (espanol)
  private fromPrismaStatus(status: PrismaJobStatus): JobStatus {
    const mapped = normalizeJobStatusInput(status);
    if (!mapped) throw new BadRequestException('Estado invalido');
    return mapped;
  }

  private mapToApiStatus = (item: PrismaJobApplication) => ({
    ...item,
    status: this.fromPrismaStatus(item.status),
  });

  private mapHistory(entry: PrismaJobApplicationHistory) {
    if (entry.type === PrismaJobApplicationHistoryType.STATUS_CHANGED) {
      const meta = entry.meta as { from?: PrismaJobStatus; to?: PrismaJobStatus };
      return {
        ...entry,
        meta: {
          from: meta?.from ? this.fromPrismaStatus(meta.from) : undefined,
          to: meta?.to ? this.fromPrismaStatus(meta.to) : undefined,
        },
      };
    }

    return { ...entry, meta: entry.meta ?? {} };
  }

  private toDate(dateString: string): Date {
    if (!dateString) {
      throw new BadRequestException('applicationDate invalida');
    }
    // Parse "YYYY-MM-DD" as a date-only at midnight UTC to avoid timezone shifts
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString);
    if (match) {
      const [, y, m, d] = match;
      const dateUtc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
      return dateUtc;
    }

    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('applicationDate invalida');
    }
    return parsed;
  }

  private validateSalaryRange(min?: number | null, max?: number | null) {
    const hasMin = min !== null && min !== undefined;
    const hasMax = max !== null && max !== undefined;
    if (hasMin && hasMax && max! < min!) {
      throw new BadRequestException('salaryMax debe ser mayor o igual a salaryMin');
    }
  }
}
