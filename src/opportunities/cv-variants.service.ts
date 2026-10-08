import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCvVariantDto } from './dto/create-cv-variant.dto';
import { UploadCvVariantDto } from './dto/upload-cv-variant.dto';
import { UpdateCvVariantDto } from './dto/update-cv-variant.dto';

type UploadedCvFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname: string;
};

@Injectable()
export class CvVariantsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.cvVariant.findMany({
      where: { userId },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async getByIdOrThrow(userId: string, id: string) {
    const variant = await this.prisma.cvVariant.findFirst({ where: { id, userId } });

    if (!variant) {
      throw new NotFoundException('CV variant not found.');
    }

    return variant;
  }

  create(userId: string, dto: CreateCvVariantDto) {
    return this.prisma.cvVariant.create({
      data: {
        name: dto.name,
        roleType: dto.roleType,
        filePath: dto.filePath,
        active: dto.active ?? true,
        userId,
      },
    });
  }

  async createFromUpload(userId: string, dto: UploadCvVariantDto, file: UploadedCvFile) {
    if (!isSupportedCvFile(file)) {
      throw new BadRequestException('Only PDF CV files are supported.');
    }

    const filePath = await this.storeUploadedCv(userId, file);
    return this.create(userId, {
      ...dto,
      filePath,
    });
  }

  async update(userId: string, id: string, dto: UpdateCvVariantDto) {
    await this.getByIdOrThrow(userId, id);

    const data: Prisma.CvVariantUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.roleType !== undefined ? { roleType: dto.roleType } : {}),
      ...(dto.filePath !== undefined ? { filePath: dto.filePath } : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
    };

    return this.prisma.cvVariant.update({
      where: { id },
      data,
    });
  }

  async remove(userId: string, id: string) {
    const variant = await this.getByIdOrThrow(userId, id);
    await this.prisma.cvVariant.delete({ where: { id } });
    await this.removeManagedFileIfNeeded(variant.filePath);
    return { success: true };
  }

  private async storeUploadedCv(userId: string, file: UploadedCvFile) {
    const uploadsDir = path.join(process.cwd(), 'uploads', 'cv', userId);
    await mkdir(uploadsDir, { recursive: true });

    const fileExtension = path.extname(file.originalname || '').toLowerCase() || '.pdf';
    const safeBaseName = sanitizeFileName(path.basename(file.originalname || 'cv', fileExtension));
    const storedName = `${Date.now()}-${safeBaseName || randomUUID()}${fileExtension}`;
    const absolutePath = path.join(uploadsDir, storedName);

    await writeFile(absolutePath, file.buffer);
    return absolutePath;
  }

  private async removeManagedFileIfNeeded(filePath: string) {
    const managedRoot = path.resolve(process.cwd(), 'uploads', 'cv');
    const normalizedPath = path.resolve(filePath);

    if (!normalizedPath.startsWith(managedRoot)) {
      return;
    }

    await rm(normalizedPath, { force: true });
  }
}

function isSupportedCvFile(file: UploadedCvFile) {
  const mimeType = file.mimetype?.toLowerCase() ?? '';
  const extension = path.extname(file.originalname || '').toLowerCase();
  return mimeType === 'application/pdf' || extension === '.pdf';
}

function sanitizeFileName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
