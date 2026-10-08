import { FeedbackDecision } from '@prisma/client';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class FeedbackDto {
  @IsEnum(FeedbackDecision)
  decision!: FeedbackDecision;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  reasonTags?: string[];

  @IsString()
  @IsOptional()
  notes?: string;
}
