import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OpportunitySource } from '@prisma/client';

export class IngestPostingItemDto {
  @IsEnum(OpportunitySource)
  source!: OpportunitySource;

  @IsUrl({ require_tld: false }, { message: 'sourceUrl must be a valid URL' })
  sourceUrl!: string;

  @IsString()
  company!: string;

  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  externalId?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  location?: string | null;

  @IsDateString()
  @IsOptional()
  publishedAt?: string | null;

  @IsString()
  @IsOptional()
  applyEmail?: string | null;

  @IsUrl({ require_tld: false }, { message: 'applyUrl must be a valid URL' })
  @IsOptional()
  applyUrl?: string | null;

  @IsObject()
  @IsOptional()
  rawPayload?: Record<string, unknown>;
}

export class IngestPostingsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => IngestPostingItemDto)
  items!: IngestPostingItemDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  userIds?: string[];

  @IsString()
  @IsOptional()
  workflowName?: string;
}
