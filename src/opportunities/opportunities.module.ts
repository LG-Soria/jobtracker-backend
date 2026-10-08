import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobApplicationsModule } from '../job-applications/job-applications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ApplicationAttemptsController } from './application-attempts.controller';
import { ApplicationAttemptsService } from './application-attempts.service';
import { CandidateSelectionService } from './candidate-selection.service';
import { AshbyConnector } from './connectors/ashby.connector';
import { GetOnBoardConnector } from './connectors/get-on-board.connector';
import { GreenhouseConnector } from './connectors/greenhouse.connector';
import { LeverConnector } from './connectors/lever.connector';
import { CvVariantsController } from './cv-variants.controller';
import { CvVariantsService } from './cv-variants.service';
import { DiscoveryPipelineService } from './discovery-pipeline.service';
import { DiscoverySchedulerService } from './discovery-scheduler.service';
import { EmailApplicationService } from './email-application.service';
import { IngestWebhookGuard } from './ingest-webhook.guard';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesIngestionController } from './opportunities-ingestion.controller';
import { OpportunitiesService } from './opportunities.service';
import { PostingNormalizationService } from './posting-normalization.service';
import { ProfileEvaluationService } from './profile-evaluation.service';
import { SearchProfilesController } from './search-profiles.controller';
import { SearchProfilesService } from './search-profiles.service';
import { SourceIngestionService } from './source-ingestion.service';
import { WorkflowClassificationService } from './workflow-classification.service';

@Module({
  imports: [PrismaModule, AuthModule, JobApplicationsModule],
  controllers: [
    SearchProfilesController,
    CvVariantsController,
    OpportunitiesController,
    OpportunitiesIngestionController,
    ApplicationAttemptsController,
  ],
  providers: [
    SearchProfilesService,
    CvVariantsService,
    OpportunitiesService,
    ApplicationAttemptsService,
    EmailApplicationService,
    SourceIngestionService,
    PostingNormalizationService,
    ProfileEvaluationService,
    CandidateSelectionService,
    WorkflowClassificationService,
    DiscoveryPipelineService,
    DiscoverySchedulerService,
    IngestWebhookGuard,
    AshbyConnector,
    GetOnBoardConnector,
    GreenhouseConnector,
    LeverConnector,
  ],
  exports: [SearchProfilesService, CvVariantsService, OpportunitiesService],
})
export class OpportunitiesModule {}
