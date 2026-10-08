import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ApproveOpportunityItemDto {
  @IsString()
  opportunityId!: string;

  @IsString()
  @IsOptional()
  cvVariantId?: string;
}

export class ApproveOpportunitiesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApproveOpportunityItemDto)
  items!: ApproveOpportunityItemDto[];
}
