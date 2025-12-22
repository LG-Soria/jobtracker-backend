// Specification: Service handling job application domain logic with Prisma.
// Handles CRUD operations for job applications and validates status against the enum.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
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
    const created = await this.prisma.jobApplication.create({
      data: {
        company: payload.company,
        position: payload.position,
        source: payload.source,
        notes: payload.notes,
        jobUrl: payload.jobUrl,
        applicationDate,
        status: this.toPrismaStatus(payload.status),
        userId,
      },
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

  async update(userId: string, id: string, data: UpdateJobApplicationDto) {
    await this.assertOwnership(id, userId);

    const updateData: Prisma.JobApplicationUpdateInput = {};

    if (data.company !== undefined) updateData.company = data.company;
    if (data.position !== undefined) updateData.position = data.position;
    if (data.source !== undefined) updateData.source = data.source;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.jobUrl !== undefined) updateData.jobUrl = data.jobUrl;

    if (data.status !== undefined) {
      updateData.status = this.toPrismaStatus(data.status);
    }

    if (data.applicationDate !== undefined) {
      updateData.applicationDate = this.toDate(data.applicationDate);
    }

    const updated = await this.prisma.jobApplication.update({
      where: { id },
      data: updateData,
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
}
