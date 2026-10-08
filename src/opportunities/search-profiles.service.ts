import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OpportunitySource,
  Prisma,
  RemotePolicy,
  SearchMatchMode,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSearchProfileDto } from './dto/create-search-profile.dto';
import { UpdateSearchProfileDto } from './dto/update-search-profile.dto';

@Injectable()
export class SearchProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const profiles = await this.prisma.searchProfile.findMany({
      where: { userId },
      include: { defaultCvVariant: true },
      orderBy: { createdAt: 'asc' },
    });

    return profiles.map(serializeSearchProfile);
  }

  async getByIdOrThrow(userId: string, id: string) {
    const profile = await this.prisma.searchProfile.findFirst({
      where: { id, userId },
      include: { defaultCvVariant: true },
    });

    if (!profile) {
      throw new NotFoundException('Search profile not found.');
    }

    return serializeSearchProfile(profile);
  }

  async create(userId: string, dto: CreateSearchProfileDto) {
    const profile = await this.prisma.searchProfile.create({
      data: {
        name: dto.name,
        roleTargets: normalizeStringArray(dto.roleTargets),
        keywords: normalizeStringArray(dto.keywords),
        locations: normalizeStringArray(dto.locations ?? []),
        remotePolicy: dto.remotePolicy ?? RemotePolicy.ANY,
        matchingMode: dto.matchingMode ?? SearchMatchMode.BALANCED,
        seniority: dto.seniority?.trim() || null,
        enabled: dto.enabled ?? true,
        dailyLimit: dto.dailyLimit ?? 20,
        sources: dto.sources?.length ? dto.sources : defaultSources(),
        defaultCvVariantId: dto.defaultCvVariantId ?? null,
        userId,
      },
      include: { defaultCvVariant: true },
    });

    return serializeSearchProfile(profile);
  }

  async update(userId: string, id: string, dto: UpdateSearchProfileDto) {
    await this.getByIdOrThrow(userId, id);

    const data: Prisma.SearchProfileUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.roleTargets !== undefined ? { roleTargets: normalizeStringArray(dto.roleTargets) } : {}),
      ...(dto.keywords !== undefined ? { keywords: normalizeStringArray(dto.keywords) } : {}),
      ...(dto.locations !== undefined ? { locations: normalizeStringArray(dto.locations) } : {}),
      ...(dto.remotePolicy !== undefined ? { remotePolicy: dto.remotePolicy } : {}),
      ...(dto.matchingMode !== undefined ? { matchingMode: dto.matchingMode } : {}),
      ...(dto.seniority !== undefined ? { seniority: dto.seniority?.trim() || null } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.dailyLimit !== undefined ? { dailyLimit: dto.dailyLimit } : {}),
      ...(dto.sources !== undefined ? { sources: dto.sources.length ? dto.sources : defaultSources() } : {}),
      ...(dto.defaultCvVariantId !== undefined ? { defaultCvVariantId: dto.defaultCvVariantId || null } : {}),
    };

    const profile = await this.prisma.searchProfile.update({
      where: { id },
      data,
      include: { defaultCvVariant: true },
    });

    return serializeSearchProfile(profile);
  }

  async remove(userId: string, id: string) {
    await this.getByIdOrThrow(userId, id);

    await this.prisma.searchProfile.delete({ where: { id } });

    return { success: true };
  }
}

function normalizeStringArray(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function defaultSources() {
  return [
    OpportunitySource.GET_ON_BOARD,
    OpportunitySource.GREENHOUSE,
    OpportunitySource.LEVER,
    OpportunitySource.ASHBY,
    OpportunitySource.SCRAPER,
  ];
}

function serializeSearchProfile<
  T extends {
    matchingMode?: SearchMatchMode;
  },
>(profile: T) {
  return {
    ...profile,
    matchingMode: profile.matchingMode ?? SearchMatchMode.BALANCED,
  };
}
