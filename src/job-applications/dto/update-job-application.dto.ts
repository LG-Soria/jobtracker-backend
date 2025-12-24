// Specification: DTO for updating job applications (partial updates).
// Supports optional fields for PATCH semantics and validates status via the shared enum.

import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  JobStatus,
  normalizeJobStatusInput,
  SalaryCurrency,
  SalaryPeriod,
  SalaryType,
} from './create-job-application.dto';

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

  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMax?: number;

  @IsOptional()
  @IsEnum(SalaryCurrency)
  salaryCurrency?: SalaryCurrency;

  @IsOptional()
  @IsEnum(SalaryPeriod)
  salaryPeriod?: SalaryPeriod;

  @IsOptional()
  @IsEnum(SalaryType)
  salaryType?: SalaryType;
}
