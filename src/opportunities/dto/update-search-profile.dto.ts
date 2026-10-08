import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { OpportunitySource, RemotePolicy, SearchMatchMode } from '@prisma/client';

const searchMatchModes = ['STRICT', 'BALANCED', 'BROAD'] as const;

export class UpdateSearchProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  roleTargets?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  locations?: string[];

  @IsEnum(RemotePolicy)
  @IsOptional()
  remotePolicy?: RemotePolicy;

  @IsIn(searchMatchModes)
  @IsOptional()
  matchingMode?: SearchMatchMode;

  @IsString()
  @IsOptional()
  seniority?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  dailyLimit?: number;

  @IsArray()
  @IsEnum(OpportunitySource, { each: true })
  @IsOptional()
  sources?: OpportunitySource[];

  @IsString()
  @IsOptional()
  defaultCvVariantId?: string;
}
