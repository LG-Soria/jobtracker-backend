import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { GuardDecision, OpportunitySource, OpportunityStatus, WorkflowDecision } from '@prisma/client';

const opportunitySortFields = ['rank', 'score', 'publishedAt', 'createdAt'] as const;
type OpportunitySortField = (typeof opportunitySortFields)[number];

export class ListOpportunitiesDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @IsEnum(OpportunityStatus)
  @IsOptional()
  status?: OpportunityStatus;

  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
  )
  @IsEnum(OpportunityStatus, { each: true })
  @IsOptional()
  statuses?: OpportunityStatus[];

  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(OpportunitySource)
  @IsOptional()
  source?: OpportunitySource;

  @IsEnum(GuardDecision)
  @IsOptional()
  guardDecision?: GuardDecision;

  @IsEnum(WorkflowDecision)
  @IsOptional()
  workflowDecision?: WorkflowDecision;

  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  @IsOptional()
  archived?: boolean;

  @IsIn(opportunitySortFields)
  @IsOptional()
  sortBy?: OpportunitySortField;

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortDirection?: 'asc' | 'desc';
}
