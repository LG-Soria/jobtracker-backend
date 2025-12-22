// Specification: DTO for updating job applications (partial updates).
// Supports optional fields for PATCH semantics and validates status via the shared enum.

import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { JobStatus, normalizeJobStatusInput } from './create-job-application.dto';

export class UpdateJobApplicationDto {
  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsDateString()
  applicationDate?: string;

  @IsOptional()
  @IsEnum(JobStatus)
  @Transform(({ value }) => normalizeJobStatusInput(value))
  status?: JobStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUrl()
  jobUrl?: string;
}
