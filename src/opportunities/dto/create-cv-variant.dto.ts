import { RoleType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

function transformBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}

export class CreateCvVariantDto {
  @IsString()
  name!: string;

  @IsEnum(RoleType)
  roleType!: RoleType;

  @IsString()
  filePath!: string;

  @Transform(({ value }) => transformBoolean(value))
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
