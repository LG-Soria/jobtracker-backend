// Specification: DTO for creating job applications.
// Defines CreateJobApplicationDto to validate incoming payloads for new job applications.
// Fields:
// - Required: company, position, applicationDate, status.
// - Optional: source, notes, jobUrl.
// Validates status against the JobStatus enum and basic string/date/url formats.

import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum JobStatus {
  ENVIADA = 'ENVIADA',
  EN_PROCESO = 'EN_PROCESO',
  ENTREVISTA = 'ENTREVISTA',
  RECHAZADA = 'RECHAZADA',
  SIN_RESPUESTA = 'SIN_RESPUESTA',
}

const STATUS_LOOKUP: Record<string, JobStatus> = {
  ENVIADA: JobStatus.ENVIADA,
  EN_PROCESO: JobStatus.EN_PROCESO,
  ENTREVISTA: JobStatus.ENTREVISTA,
  RECHAZADA: JobStatus.RECHAZADA,
  SIN_RESPUESTA: JobStatus.SIN_RESPUESTA,
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  [JobStatus.ENVIADA]: 'Enviada',
  [JobStatus.EN_PROCESO]: 'En proceso',
  [JobStatus.ENTREVISTA]: 'Entrevista',
  [JobStatus.RECHAZADA]: 'Rechazada',
  [JobStatus.SIN_RESPUESTA]: 'Sin respuesta',
};

export const normalizeJobStatusInput = (value: unknown): JobStatus | undefined => {
  if (value === undefined || value === null) return undefined;
  const normalized = value
    .toString()
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
  return STATUS_LOOKUP[normalized];
};

export class CreateJobApplicationDto {
  @IsString()
  @IsNotEmpty()
  company!: string;

  @IsString()
  @IsNotEmpty()
  position!: string;

  @IsString()
  @IsNotEmpty()
  source!: string;

  @IsDateString()
  @IsNotEmpty()
  applicationDate!: string;

  @IsEnum(JobStatus)
  @Transform(({ value }) => normalizeJobStatusInput(value))
  status!: JobStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUrl()
  jobUrl?: string;
}
