import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IngestPostingsDto } from './dto/ingest-postings.dto';
import { IngestWebhookGuard } from './ingest-webhook.guard';
import { OpportunitiesService } from './opportunities.service';

@Controller('opportunities/ingest')
export class OpportunitiesIngestionController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Post('webhook')
  @UseGuards(IngestWebhookGuard)
  webhook(@Body() dto: IngestPostingsDto) {
    return this.opportunitiesService.ingestExternalPostings(dto);
  }
}
