import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JobStatus, normalizeJobStatusInput } from './create-job-application.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class ListJobApplicationsQueryDto {
  @IsOptional()
  @IsEnum(JobStatus)
  @Transform(({ value }) => normalizeJobStatusInput(value))
  status?: JobStatus;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @Transform(({ value }) => {
    const num = Number(value);
    if (!value || Number.isNaN(num)) return DEFAULT_PAGE;
    return Math.trunc(num);
  })
  @IsInt()
  @Min(1)
  page: number = DEFAULT_PAGE;

  @Transform(({ value }) => {
    const num = Number(value);
    if (!value || Number.isNaN(num)) return DEFAULT_LIMIT;
    return Math.min(Math.trunc(num), MAX_LIMIT);
  })
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT;
}
