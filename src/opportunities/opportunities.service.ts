import {
  ApplicationAttemptStatus,
  Eligibility,
  FeedbackDecision,
  Opportunity,
  OpportunitySource,
  OpportunityStatus,
  Prisma,
  RoleType,
  WorkflowDecision,
} from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthPayload } from '../auth/auth.types';
import { EmailApplicationService } from './email-application.service';
import { CvVariantsService } from './cv-variants.service';
import { SearchProfilesService } from './search-profiles.service';
import { JobApplicationsService } from '../job-applications/job-applications.service';
import { JobStatus } from '../job-applications/dto/create-job-application.dto';
import { ApproveOpportunitiesDto } from './dto/approve-opportunities.dto';
import { FeedbackDto } from './dto/feedback.dto';
import { IngestPostingsDto } from './dto/ingest-postings.dto';
import { ListOpportunitiesDto } from './dto/list-opportunities.dto';
import { DiscoveryPipelineService } from './discovery-pipeline.service';
import { SourceIngestionService } from './source-ingestion.service';
import { ConnectorOpportunity } from './connectors/discovery-connector.interface';

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchProfilesService: SearchProfilesService,
    private readonly cvVariantsService: CvVariantsService,
    private readonly emailApplicationService: EmailApplicationService,
    private readonly jobApplicationsService: JobApplicationsService,
    private readonly sourceIngestionService: SourceIngestionService,
    private readonly discoveryPipelineService: DiscoveryPipelineService,
  ) {}

  async list(userId: string, query: ListOpportunitiesDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const statuses = query.statuses?.length ? query.statuses : query.status ? [query.status] : undefined;
    const where: Prisma.OpportunityWhereInput = {
      userId,
      archivedAt: query.archived ? { not: null } : null,
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.guardDecision ? { guardDecision: query.guardDecision } : {}),
      ...(query.workflowDecision ? { workflowDecision: query.workflowDecision } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { company: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const sortBy = query.sortBy ?? 'rank';
    const sortDirection = query.sortDirection ?? 'desc';
    const include = {
      searchProfile: true,
      cvVariantSuggested: true,
      feedbackSignals: {
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    } satisfies Prisma.OpportunityInclude;

    const total = await this.prisma.opportunity.count({ where });
    let items;

    if (sortBy === 'rank') {
      const rankedItems = await this.prisma.opportunity.findMany({
        where,
        include,
      });
      const direction = sortDirection === 'asc' ? -1 : 1;
      rankedItems.sort((left, right) => compareOpportunityRank(left, right) * direction);
      items = rankedItems.slice((page - 1) * limit, (page - 1) * limit + limit);
    } else {
      const orderBy: Prisma.OpportunityOrderByWithRelationInput[] =
        sortBy === 'score'
          ? [{ score: sortDirection }, { publishedAt: 'desc' }, { createdAt: 'desc' }]
          : [{ [sortBy]: sortDirection }, { createdAt: 'desc' }];

      items = await this.prisma.opportunity.findMany({
        where,
        include,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      });
    }

    return {
      items: items.map(serializeOpportunity),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getAutomationStatus(userId: string) {
    const greenhouseBoards = splitEnvList(process.env.GREENHOUSE_BOARD_TOKENS);
    const leverCompanies = splitEnvList(process.env.LEVER_COMPANIES);
    const ashbyBoards = splitEnvList(process.env.ASHBY_JOB_BOARD_NAMES);
    const [user, sourceCounts, runningRun] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { lastDiscoveryRunAt: true },
      }),
      this.prisma.opportunity.groupBy({
        by: ['source'],
        where: { userId, archivedAt: null },
        _count: { _all: true },
      }),
      this.prisma.discoveryRun.findFirst({
        where: { status: 'RUNNING' },
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    const countsBySource = sourceCounts.reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.source] = item._count._all;
      return accumulator;
    }, {});

    return {
      smtpMockMode: process.env.SMTP_MOCK_MODE === 'true',
      smtpConfigured: Boolean(
        process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
      ),
      applicantNameConfigured: Boolean(process.env.APPLICANT_NAME?.trim()),
      applicantEmailConfigured: Boolean(process.env.APPLICANT_EMAIL?.trim()),
      discoveryBatchEnabled: process.env.DISCOVERY_BATCH_ENABLED === 'true',
      ingestWebhookConfigured: Boolean(process.env.INGEST_WEBHOOK_SECRET?.trim()),
      getOnBoardConfigured: Boolean(
        process.env.GETONBOARD_FEED_URL?.trim() || process.env.GETONBOARD_DISCOVERY_URL?.trim(),
      ),
      greenhouseBoardsCount: greenhouseBoards.length,
      leverCompaniesCount: leverCompanies.length,
      ashbyBoardsCount: ashbyBoards.length,
      lastDiscoveryRunAt: user?.lastDiscoveryRunAt ?? null,
      activeRunStartedAt: runningRun?.startedAt ?? null,
      sourceOpportunityCounts: {
        GET_ON_BOARD: countsBySource.GET_ON_BOARD ?? 0,
        GREENHOUSE: countsBySource.GREENHOUSE ?? 0,
        LEVER: countsBySource.LEVER ?? 0,
        ASHBY: countsBySource.ASHBY ?? 0,
        SCRAPER: countsBySource.SCRAPER ?? 0,
      },
      configuredSources: [
        ...(
          process.env.GETONBOARD_FEED_URL?.trim() || process.env.GETONBOARD_DISCOVERY_URL?.trim()
            ? ['GET_ON_BOARD']
            : []
        ),
        ...(greenhouseBoards.length ? ['GREENHOUSE'] : []),
        ...(leverCompanies.length ? ['LEVER'] : []),
        ...(ashbyBoards.length ? ['ASHBY'] : []),
        ...(process.env.INGEST_WEBHOOK_SECRET?.trim() ? ['SCRAPER'] : []),
      ],
    };
  }

  async getByIdOrThrow(userId: string, id: string) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { userId, id },
      include: {
        searchProfile: true,
        cvVariantSuggested: true,
        feedbackSignals: {
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found.');
    }

    return serializeOpportunity(opportunity);
  }

  async dismiss(user: AuthPayload, id: string) {
    await this.getByIdOrThrow(user.sub, id);

    return this.prisma.opportunity.update({
      where: { id },
      data: {
        status: OpportunityStatus.DISMISSED,
        workflowDecision: WorkflowDecision.DISMISSED_POLICY,
        workflowReasons: ['Dismissed manually by user.'],
        guardReason: 'Dismissed manually by user.',
      },
    });
  }

  async clearOpenOpportunities(user: AuthPayload) {
    const result = await this.prisma.opportunity.updateMany({
      where: {
        userId: user.sub,
        archivedAt: null,
        status: {
          in: [
            OpportunityStatus.DISCOVERED,
            OpportunityStatus.QUALIFIED,
            OpportunityStatus.QUEUED_FOR_APPROVAL,
            OpportunityStatus.APPROVED,
            OpportunityStatus.DISMISSED,
          ],
        },
      },
      data: {
        archivedAt: new Date(),
        workflowReasons: ['Archived from the Automation Hub open list.'],
      },
    });

    return { archived: result.count };
  }

  async registerInTracker(user: AuthPayload, id: string) {
    const opportunity = await this.getByIdOrThrow(user.sub, id);
    const normalizedUrl = opportunity.applyUrl ?? opportunity.sourceUrl ?? null;
    const fingerprint = buildSemanticFingerprint(opportunity.company, opportunity.title);

    const existingCandidates = await this.prisma.jobApplication.findMany({
      where: {
        userId: user.sub,
        OR: [
          ...(normalizedUrl ? [{ jobUrl: normalizedUrl }] : []),
          { company: { equals: opportunity.company, mode: 'insensitive' } },
        ],
      },
      take: 25,
    });
    const existing = existingCandidates.find(
      (application) =>
        (normalizedUrl ? application.jobUrl === normalizedUrl : false) ||
        buildSemanticFingerprint(application.company, application.position) === fingerprint,
    );

    const jobApplication =
      existing ??
      (await this.jobApplicationsService.create(user.sub, {
        company: opportunity.company,
        position: opportunity.title,
        source: formatOpportunitySource(opportunity.source),
        applicationDate: new Date().toISOString().slice(0, 10),
        status: JobStatus.ENVIADA,
        jobUrl: normalizedUrl ?? undefined,
        notes: buildTrackerNotes(opportunity),
      }));

    await this.prisma.$transaction([
      this.prisma.opportunity.update({
        where: { id: opportunity.id },
        data: {
          status: OpportunityStatus.APPROVED,
          workflowDecision: WorkflowDecision.TRACKED_EXISTING,
          workflowReasons: [
            existing
              ? 'Linked to an existing tracker application.'
              : 'Registered in the tracker from the automation hub.',
          ],
          guardReason: existing
            ? 'Registered in tracker using existing application record.'
            : 'Registered in tracker from automation hub.',
        },
      }),
      this.prisma.feedbackSignal.create({
        data: {
          opportunityId: opportunity.id,
          userId: user.sub,
          decision: FeedbackDecision.APPROVED,
          notes: existing
            ? 'Opportunity linked to an existing tracker application.'
            : 'Opportunity registered in the main tracker.',
        },
      }),
    ]);

    return {
      jobApplication,
      alreadyExists: Boolean(existing),
    };
  }

  async addFeedback(user: AuthPayload, id: string, dto: FeedbackDto) {
    await this.getByIdOrThrow(user.sub, id);

    return this.prisma.feedbackSignal.create({
      data: {
        opportunityId: id,
        userId: user.sub,
        decision: dto.decision,
        rating: dto.rating ?? null,
        reasonTags: dto.reasonTags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
        notes: dto.notes?.trim() || null,
      },
    });
  }

  runDiscoveryBatchForUser(user: AuthPayload) {
    return this.discoveryPipelineService.run({
      triggeredByUserId: user.sub,
      userIds: [user.sub],
    });
  }

  runDiscoveryBatchForAllUsers() {
    return this.discoveryPipelineService.run();
  }

  async ingestExternalPostings(dto: IngestPostingsDto) {
    const postingsBySource = dto.items.reduce<Map<OpportunitySource, ConnectorOpportunity[]>>((accumulator, item) => {
      const posting: ConnectorOpportunity = {
        externalId: item.externalId?.trim() || buildImportedExternalId(item.sourceUrl, item.company, item.title),
        source: item.source,
        sourceUrl: item.sourceUrl.trim(),
        company: item.company.trim(),
        title: item.title.trim(),
        description: item.description?.trim() ?? '',
        location: item.location?.trim() || null,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
        applyEmail: item.applyEmail?.trim()?.toLowerCase() || null,
        applyUrl: item.applyUrl?.trim() || item.sourceUrl.trim(),
        payloadJson: {
          source: item.source,
          sourceUrl: item.sourceUrl,
          workflowName: dto.workflowName ?? null,
          rawPayload: item.rawPayload ?? null,
          importedAt: new Date().toISOString(),
        },
      };

      const bucket = accumulator.get(item.source) ?? [];
      bucket.push(posting);
      accumulator.set(item.source, bucket);
      return accumulator;
    }, new Map());

    const ingestionResults = await Promise.all(
      [...postingsBySource.entries()].map(([source, postings]) =>
        this.sourceIngestionService.ingestImportedPostings(source, postings),
      ),
    );

    const summary = await this.discoveryPipelineService.runWithIngestionResults(ingestionResults, {
      userIds: dto.userIds,
    });

    return {
      mode: 'ingest_webhook',
      importedSources: ingestionResults.reduce<Record<string, number>>((accumulator, result) => {
        accumulator[result.source] = result.discovered;
        return accumulator;
      }, {}),
      importedCount: dto.items.length,
      ...summary,
    };
  }

  async approveQueuedApplications(user: AuthPayload, dto: ApproveOpportunitiesDto) {
    const results = [];

    for (const item of dto.items) {
      const opportunity = await this.getByIdOrThrow(user.sub, item.opportunityId);
      const cvVariant = await this.resolveCvVariant(user.sub, opportunity, item.cvVariantId);
      const recipientEmail = opportunity.applyEmail;

      if (!recipientEmail) {
        throw new NotFoundException('Opportunity does not have an application email.');
      }

      const message = buildMessage(opportunity, user.email);

      await this.prisma.opportunity.update({
        where: { id: opportunity.id },
        data: { status: OpportunityStatus.APPROVED },
      });

      try {
        const response = await this.emailApplicationService.sendApplication({
          to: recipientEmail,
          subject: message.subject,
          body: message.body,
          attachmentPath: cvVariant.filePath,
          attachmentName: sanitizeAttachmentName(cvVariant.name),
        });

        const attempt = await this.prisma.applicationAttempt.create({
          data: {
            opportunityId: opportunity.id,
            cvVariantId: cvVariant.id,
            deliveryChannel: opportunity.applyChannel,
            recipientEmail,
            subject: message.subject,
            body: message.body,
            providerMessageId: response.messageId,
            status: ApplicationAttemptStatus.SENT,
            sentAt: new Date(),
            userId: user.sub,
          },
        });

        await this.prisma.opportunity.update({
          where: { id: opportunity.id },
          data: { status: OpportunityStatus.SENT },
        });

        await this.prisma.feedbackSignal.create({
          data: {
            opportunityId: opportunity.id,
            userId: user.sub,
            decision: FeedbackDecision.APPROVED,
            notes: 'Approved and sent from queue.',
          },
        });

        results.push({
          opportunityId: opportunity.id,
          status: ApplicationAttemptStatus.SENT,
          attemptId: attempt.id,
        });
      } catch (error) {
        const attempt = await this.prisma.applicationAttempt.create({
          data: {
            opportunityId: opportunity.id,
            cvVariantId: cvVariant.id,
            deliveryChannel: opportunity.applyChannel,
            recipientEmail,
            subject: message.subject,
            body: message.body,
            errorMessage: toErrorMessage(error),
            status: ApplicationAttemptStatus.FAILED,
            userId: user.sub,
          },
        });

        await this.prisma.opportunity.update({
          where: { id: opportunity.id },
          data: { status: OpportunityStatus.FAILED },
        });

        results.push({
          opportunityId: opportunity.id,
          status: ApplicationAttemptStatus.FAILED,
          attemptId: attempt.id,
          errorMessage: toErrorMessage(error),
        });
      }
    }

    return { items: results };
  }

  private async resolveCvVariant(userId: string, opportunity: Opportunity, overrideCvVariantId?: string) {
    if (overrideCvVariantId) {
      return this.cvVariantsService.getByIdOrThrow(userId, overrideCvVariantId);
    }

    if (opportunity.cvVariantSuggestedId) {
      return this.cvVariantsService.getByIdOrThrow(userId, opportunity.cvVariantSuggestedId);
    }

    if (opportunity.searchProfileId) {
      const profile = await this.searchProfilesService.getByIdOrThrow(userId, opportunity.searchProfileId);
      if (profile.defaultCvVariantId) {
        return this.cvVariantsService.getByIdOrThrow(userId, profile.defaultCvVariantId);
      }
    }

    const firstVariant = await this.prisma.cvVariant.findFirst({
      where: { userId, active: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!firstVariant) {
      throw new NotFoundException('No active CV variant available.');
    }

    return firstVariant;
  }
}

function serializeOpportunity<
  T extends {
    feedbackSignals?: Array<{
      id: string;
      decision: FeedbackDecision;
      rating: number | null;
      reasonTags: string[];
      notes: string | null;
      createdAt: Date;
    }>;
    matchingSummaryJson?: Prisma.JsonValue | null;
  },
>(opportunity: T) {
  const latestFeedback = opportunity.feedbackSignals?.[0] ?? null;

  return {
    ...opportunity,
    matchingSummary: opportunity.matchingSummaryJson ?? null,
    latestFeedback,
  };
}

function compareOpportunityRank(
  left: Opportunity & { matchingSummaryJson?: Prisma.JsonValue | null; publishedAt: Date | null; createdAt: Date; updatedAt: Date },
  right: Opportunity & { matchingSummaryJson?: Prisma.JsonValue | null; publishedAt: Date | null; createdAt: Date; updatedAt: Date },
) {
  const leftSummary = toMatchingSummary(left.matchingSummaryJson);
  const rightSummary = toMatchingSummary(right.matchingSummaryJson);

  const eligibilityDiff = eligibilityRank(rightSummary?.eligibility) - eligibilityRank(leftSummary?.eligibility);
  if (eligibilityDiff !== 0) {
    return eligibilityDiff;
  }

  const locationDiff = (rightSummary?.locationTier ?? 0) - (leftSummary?.locationTier ?? 0);
  if (locationDiff !== 0) {
    return locationDiff;
  }

  const targetDiff = (rightSummary?.targetMatchTier ?? 0) - (leftSummary?.targetMatchTier ?? 0);
  if (targetDiff !== 0) {
    return targetDiff;
  }

  const keywordDiff = (rightSummary?.keywordSupportTier ?? 0) - (leftSummary?.keywordSupportTier ?? 0);
  if (keywordDiff !== 0) {
    return keywordDiff;
  }

  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const publishedDiff = (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0);
  if (publishedDiff !== 0) {
    return publishedDiff;
  }

  return right.createdAt.getTime() - left.createdAt.getTime();
}

function toMatchingSummary(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as {
    eligibility?: Eligibility;
    locationTier?: number;
    targetMatchTier?: number;
    keywordSupportTier?: number;
  };
}

function eligibilityRank(value: Eligibility | undefined) {
  switch (value) {
    case 'PASS':
      return 3;
    case 'UNKNOWN':
      return 2;
    case 'FAIL':
      return 1;
    default:
      return 0;
  }
}

function buildSemanticFingerprint(company: string, title: string) {
  const normalizedCompany = normalizeFingerprintToken(company);
  const normalizedTitle = normalizeFingerprintToken(title);
  return `${normalizedCompany}-${normalizedTitle}`.replace(/(^-|-$)/g, '');
}

function normalizeFingerprintToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildMessage(opportunity: Opportunity, senderEmail: string) {
  const applicantName = process.env.APPLICANT_NAME?.trim() || 'JobTracker Applicant';
  const applicantEmail = process.env.APPLICANT_EMAIL?.trim() || senderEmail;

  return {
    subject: `Application for ${opportunity.title} - ${applicantName}`,
    body: [
      'Hello,',
      '',
      `I am applying for the ${opportunity.title} opportunity at ${opportunity.company}.`,
      'I am attaching my resume for your review.',
      '',
      `You can reach me at ${applicantEmail}.`,
      '',
      'Best regards,',
      applicantName,
    ].join('\n'),
  };
}

function sanitizeAttachmentName(value: string) {
  return `${value.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;
}

function formatOpportunitySource(source: OpportunitySource) {
  return source.toLowerCase().replace(/_/g, ' ');
}

function buildImportedExternalId(sourceUrl: string, company: string, title: string) {
  const normalizedUrl = sourceUrl.trim().toLowerCase();
  if (normalizedUrl) {
    return normalizedUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  return buildSemanticFingerprint(company, title);
}

function buildTrackerNotes(opportunity: Opportunity) {
  const details = [
    'Registrada desde Automation Hub.',
    `Fuente: ${formatOpportunitySource(opportunity.source)}.`,
    `Score: ${(opportunity.score * 100).toFixed(0)}%.`,
  ];

  if (opportunity.profileMatch) {
    details.push(`Perfil sugerido: ${opportunity.profileMatch}.`);
  }

  if (opportunity.applyEmail) {
    details.push(`Email detectado: ${opportunity.applyEmail}.`);
  }

  if (opportunity.location) {
    details.push(`Ubicacion: ${opportunity.location}.`);
  }

  return details.join(' ');
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function splitEnvList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
