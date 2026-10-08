import { Injectable, Logger } from '@nestjs/common';
import {
  Eligibility,
  OpportunityStatus,
  Prisma,
  SearchMatchMode,
  WorkflowDecision,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildSemanticFingerprint } from './discovery.helpers';
import { CandidateSelectionService } from './candidate-selection.service';
import { PostingNormalizationService } from './posting-normalization.service';
import { ProfileEvaluationService } from './profile-evaluation.service';
import { SourceIngestionService } from './source-ingestion.service';
import { WorkflowClassificationService } from './workflow-classification.service';
import {
  DiscoveryEvaluationSummary,
  DiscoverySourceResult,
  MatchingSummary,
  ProfileEvaluation,
  ProfileWithDefaultCv,
} from './discovery.types';

type PipelineOptions = {
  triggeredByUserId?: string;
  userIds?: string[];
};

type UserScope = {
  id: string;
  email: string;
  role: string;
  searchProfiles: ProfileWithDefaultCv[];
};

@Injectable()
export class DiscoveryPipelineService {
  private readonly logger = new Logger(DiscoveryPipelineService.name);
  private readonly lockKey = 'discovery-pipeline';

  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceIngestionService: SourceIngestionService,
    private readonly postingNormalizationService: PostingNormalizationService,
    private readonly profileEvaluationService: ProfileEvaluationService,
    private readonly candidateSelectionService: CandidateSelectionService,
    private readonly workflowClassificationService: WorkflowClassificationService,
  ) {}

  async run(options: PipelineOptions = {}) {
    return this.runLocked(async () => this.sourceIngestionService.ingestAllSources(), options);
  }

  async runWithIngestionResults(ingestionResults: DiscoverySourceResult[], options: PipelineOptions = {}) {
    return this.runLocked(async () => ingestionResults, options);
  }

  private async runLocked(
    loadIngestionResults: () => Promise<DiscoverySourceResult[]>,
    options: PipelineOptions = {},
  ) {
    const activeRun = await this.prisma.discoveryRun.findFirst({
      where: {
        lockKey: this.lockKey,
        status: 'RUNNING',
        startedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (activeRun) {
      return {
        inserted: 0,
        updated: 0,
        queued: 0,
        deduplicated: 0,
        filteredOutByScore: 0,
        locked: true,
        statusSummary: {},
        evaluationSummary: emptyEvaluationSummary(),
        sources: {},
      };
    }

    const run = await this.prisma.discoveryRun.create({
      data: {
        lockKey: this.lockKey,
        status: 'RUNNING',
        triggeredByUserId: options.triggeredByUserId ?? null,
      },
    });

    try {
      const ingestionResults = await loadIngestionResults();
      const users = await this.loadUsers(options.userIds);
      const normalizedPostings = ingestionResults.flatMap((result) =>
        this.postingNormalizationService.normalizeMany(result.sourcePostings),
      );
      const sourceStats = buildSourceStats(ingestionResults);

      let inserted = 0;
      let updated = 0;
      let queued = 0;
      let filteredOutByScore = 0;
      const statusSummary: Partial<Record<OpportunityStatus, number>> = {};
      const evaluationSummary = emptyEvaluationSummary();

      for (const user of users) {
        const userResult = await this.processUser(user, normalizedPostings, sourceStats, evaluationSummary);
        inserted += userResult.inserted;
        updated += userResult.updated;
        queued += userResult.queued;
        filteredOutByScore += userResult.filteredOutByScore;
        mergeStatusSummary(statusSummary, userResult.statusSummary);

        await this.prisma.user.update({
          where: { id: user.id },
          data: { lastDiscoveryRunAt: new Date() },
        });
      }

      const deduplicated = await this.collapseOpenSemanticDuplicates(options.userIds);
      const summary = {
        inserted,
        updated,
        queued,
        deduplicated,
        filteredOutByScore,
        statusSummary,
        evaluationSummary,
        sources: sourceStats,
      };

      await this.prisma.discoveryRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCESS',
          finishedAt: new Date(),
          summaryJson: summary as unknown as Prisma.JsonObject,
        },
      });

      return summary;
    } catch (error) {
      await this.prisma.discoveryRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: toErrorMessage(error),
        },
      });
      throw error;
    }
  }

  private async processUser(
    user: UserScope,
    normalizedPostings: ReturnType<PostingNormalizationService['normalizeMany']>,
    sourceStats: Record<
      string,
      {
        discovered: number;
        inserted: number;
        updated: number;
        queued: number;
        filteredOutByScore: number;
        statusSummary: Partial<Record<OpportunityStatus, number>>;
      }
    >,
    evaluationSummary: DiscoveryEvaluationSummary,
  ) {
    if (!user.searchProfiles.length) {
      return {
        inserted: 0,
        updated: 0,
        queued: 0,
        filteredOutByScore: 0,
        statusSummary: {} as Partial<Record<OpportunityStatus, number>>,
      };
    }

    const profilesById = new Map(user.searchProfiles.map((profile) => [profile.id, profile]));
    const feedbackSignals = await this.prisma.feedbackSignal.findMany({
      where: { userId: user.id },
      include: {
        opportunity: {
          select: {
            company: true,
            location: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const feedbackPreferences = this.profileEvaluationService.buildFeedbackPreferences(feedbackSignals);
    const trackerApplications = await this.prisma.jobApplication.findMany({
      where: { userId: user.id },
      select: {
        company: true,
        position: true,
        jobUrl: true,
      },
      take: 500,
    });
    const recentAttempts = await this.prisma.applicationAttempt.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: {
        opportunity: {
          select: {
            normalizedFingerprint: true,
          },
        },
      },
      take: 500,
    });
    const existingOpportunities = await this.prisma.opportunity.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        source: true,
        externalId: true,
        status: true,
        guardDecision: true,
        guardReason: true,
        workflowDecision: true,
        workflowReasons: true,
        archivedAt: true,
      },
    });
    const existingOpportunitiesByExternalId = new Map(
      existingOpportunities.map((item) => [`${item.source}:${item.externalId}`, item]),
    );

    const postingCandidates = normalizedPostings
      .map((posting) => {
        const relevantProfiles = user.searchProfiles.filter((profile) => profile.sources.includes(posting.source));
        const evaluations = relevantProfiles.map((profile) =>
          this.profileEvaluationService.evaluatePostingForProfile(profile, posting, feedbackPreferences),
        );

        return {
          posting,
          evaluations,
          selection: this.candidateSelectionService.selectBestEvaluation(
            profilesById,
            evaluations,
            (profile, evaluation) => this.profileEvaluationService.buildMatchingSummary(profile, evaluation),
          ),
        };
      })
      .filter((item) => item.evaluations.length > 0);

    const evaluationIds = new Map<string, string>();
    for (const candidate of postingCandidates) {
      const winnerKey = candidate.selection
        ? `${candidate.selection.evaluation.sourcePostingId}:${candidate.selection.evaluation.searchProfileId}`
        : null;

      for (const evaluation of candidate.evaluations) {
        const record = await this.prisma.postingEvaluation.upsert({
          where: {
            sourcePostingId_userId_searchProfileId: {
              sourcePostingId: evaluation.sourcePostingId,
              userId: user.id,
              searchProfileId: evaluation.searchProfileId,
            },
          },
          update: {
            eligibility: evaluation.eligibility,
            eligibilityReasons: evaluation.eligibilityReasons,
            relevanceScore: evaluation.relevanceScore,
            confidenceScore: evaluation.confidenceScore,
            finalScore: evaluation.finalScore,
            selected: `${evaluation.sourcePostingId}:${evaluation.searchProfileId}` === winnerKey,
            explanationJson: evaluation.explanation as unknown as Prisma.JsonObject,
          },
          create: {
            sourcePostingId: evaluation.sourcePostingId,
            userId: user.id,
            searchProfileId: evaluation.searchProfileId,
            eligibility: evaluation.eligibility,
            eligibilityReasons: evaluation.eligibilityReasons,
            relevanceScore: evaluation.relevanceScore,
            confidenceScore: evaluation.confidenceScore,
            finalScore: evaluation.finalScore,
            selected: `${evaluation.sourcePostingId}:${evaluation.searchProfileId}` === winnerKey,
            explanationJson: evaluation.explanation as unknown as Prisma.JsonObject,
          },
        });

        evaluationIds.set(`${evaluation.sourcePostingId}:${evaluation.searchProfileId}`, record.id);
      }
    }

    const queueAllowance = buildQueueAllowance(postingCandidates);
    let inserted = 0;
    let updated = 0;
    let queued = 0;
    let filteredOutByScore = 0;
    const statusSummary: Partial<Record<OpportunityStatus, number>> = {};

    for (const candidate of postingCandidates) {
      const selection = candidate.selection;
      if (!selection) {
        continue;
      }

      const matchingSummary = selection.matchingSummary;
      evaluationSummary[matchingSummary.eligibility.toLowerCase() as 'pass' | 'unknown' | 'fail'] += 1;
      evaluationSummary.selectedByProfile[selection.profile.name] =
        (evaluationSummary.selectedByProfile[selection.profile.name] ?? 0) + 1;

      if (
        matchingSummary.finalScore <= 0.05 &&
        matchingSummary.eligibility === Eligibility.FAIL &&
        matchingSummary.eligibilityReasons.includes('no_semantic_match')
      ) {
        filteredOutByScore += 1;
        sourceStats[candidate.posting.source].filteredOutByScore += 1;
        continue;
      }

      const trackerDuplicate = hasTrackerDuplicate(trackerApplications, candidate.posting);
      const recentApplicationDuplicate = recentAttempts.some(
        (attempt) => attempt.opportunity.normalizedFingerprint === candidate.posting.normalizedFingerprint,
      );
      const classification = this.workflowClassificationService.classify(candidate.posting, matchingSummary, {
        matchingMode: selection.profile.matchingMode,
        withinDailyLimit: queueAllowance.has(
          `${candidate.posting.sourcePostingId}:${selection.profile.id}`,
        ),
        trackerDuplicate,
        recentApplicationDuplicate,
      });
      const selectedEvaluationId =
        evaluationIds.get(`${candidate.posting.sourcePostingId}:${selection.profile.id}`) ?? null;
      const existing =
        existingOpportunitiesByExternalId.get(`${candidate.posting.source}:${candidate.posting.externalId}`) ??
        null;

      const shouldPreserveTerminalStatus =
        existing?.status === OpportunityStatus.APPROVED ||
        existing?.status === OpportunityStatus.SENT ||
        existing?.status === OpportunityStatus.FAILED;
      const persistedStatus = shouldPreserveTerminalStatus ? existing.status : classification.status;
      const persistedWorkflowDecision = shouldPreserveTerminalStatus
        ? existing.workflowDecision ?? WorkflowDecision.TRACKED_EXISTING
        : classification.workflowDecision;
      const persistedWorkflowReasons = shouldPreserveTerminalStatus
        ? existing.workflowReasons.length
          ? existing.workflowReasons
          : classification.workflowReasons
        : classification.workflowReasons;
      const persistedGuardDecision = shouldPreserveTerminalStatus
        ? existing.guardDecision
        : classification.guardDecision;
      const persistedGuardReason = shouldPreserveTerminalStatus
        ? existing.guardReason ?? classification.guardReason
        : classification.guardReason;

      const record = await this.prisma.opportunity.upsert({
        where: {
          userId_source_externalId: {
            userId: user.id,
            source: candidate.posting.source,
            externalId: candidate.posting.externalId,
          },
        },
        update: {
          sourceUrl: candidate.posting.sourceUrl,
          company: candidate.posting.company,
          title: candidate.posting.title,
          description: candidate.posting.description,
          location: candidate.posting.locationRaw,
          remote: candidate.posting.isRemote,
          publishedAt: candidate.posting.publishedAt,
          applyEmail: candidate.posting.applyEmail,
          applyUrl: candidate.posting.applyUrl,
          normalizedFingerprint: candidate.posting.normalizedFingerprint,
          profileMatch: selection.profile.name,
          score: matchingSummary.finalScore,
          applyChannel: candidate.posting.applyChannel,
          status: persistedStatus,
          guardDecision: persistedGuardDecision,
          guardReason: persistedGuardReason,
          workflowDecision: persistedWorkflowDecision,
          workflowReasons: persistedWorkflowReasons,
          matchingSummaryJson: matchingSummary as unknown as Prisma.JsonObject,
          searchProfileId: selection.profile.id,
          cvVariantSuggestedId: await this.resolveSuggestedCvVariantId(user.id, selection.profile, candidate.posting),
          sourcePostingId: candidate.posting.sourcePostingId,
          selectedEvaluationId,
          archivedAt: null,
        },
        create: {
          externalId: candidate.posting.externalId,
          source: candidate.posting.source,
          sourceUrl: candidate.posting.sourceUrl,
          company: candidate.posting.company,
          title: candidate.posting.title,
          description: candidate.posting.description,
          location: candidate.posting.locationRaw,
          remote: candidate.posting.isRemote,
          publishedAt: candidate.posting.publishedAt,
          applyEmail: candidate.posting.applyEmail,
          applyUrl: candidate.posting.applyUrl,
          normalizedFingerprint: candidate.posting.normalizedFingerprint,
          profileMatch: selection.profile.name,
          score: matchingSummary.finalScore,
          applyChannel: candidate.posting.applyChannel,
          status: classification.status,
          guardDecision: classification.guardDecision,
          guardReason: classification.guardReason,
          workflowDecision: classification.workflowDecision,
          workflowReasons: classification.workflowReasons,
          matchingSummaryJson: matchingSummary as unknown as Prisma.JsonObject,
          userId: user.id,
          searchProfileId: selection.profile.id,
          cvVariantSuggestedId: await this.resolveSuggestedCvVariantId(user.id, selection.profile, candidate.posting),
          sourcePostingId: candidate.posting.sourcePostingId,
          selectedEvaluationId,
        },
      });

      if (existing) {
        updated += 1;
        sourceStats[candidate.posting.source].updated += 1;
      } else {
        inserted += 1;
        sourceStats[candidate.posting.source].inserted += 1;
      }

      if (record.status === OpportunityStatus.QUEUED_FOR_APPROVAL) {
        queued += 1;
        sourceStats[candidate.posting.source].queued += 1;
      }

      statusSummary[record.status] = (statusSummary[record.status] ?? 0) + 1;
      sourceStats[candidate.posting.source].statusSummary[record.status] =
        (sourceStats[candidate.posting.source].statusSummary[record.status] ?? 0) + 1;
    }

    return {
      inserted,
      updated,
      queued,
      filteredOutByScore,
      statusSummary,
    };
  }

  private async loadUsers(userIds?: string[]) {
    const users = await this.prisma.user.findMany({
      where: userIds?.length ? { id: { in: userIds } } : undefined,
      select: {
        id: true,
        email: true,
        role: true,
        searchProfiles: {
          where: { enabled: true },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            roleTargets: true,
            keywords: true,
            locations: true,
            remotePolicy: true,
            matchingMode: true,
            seniority: true,
            enabled: true,
            dailyLimit: true,
            sources: true,
            userId: true,
            defaultCvVariantId: true,
            createdAt: true,
          },
        },
      },
    });

    return users.map((user) => ({
      ...user,
      searchProfiles: user.searchProfiles as ProfileWithDefaultCv[],
    }));
  }

  private async resolveSuggestedCvVariantId(
    userId: string,
    profile: ProfileWithDefaultCv,
    posting: { title: string; description: string },
  ) {
    if (profile.defaultCvVariantId) {
      return profile.defaultCvVariantId;
    }

    const desiredRole = /(full\s*stack|backend|api|server|node)/i.test(
      `${profile.name} ${profile.roleTargets.join(' ')} ${posting.title} ${posting.description}`,
    )
      ? 'FULLSTACK'
      : 'FRONTEND';

    const variant = await this.prisma.cvVariant.findFirst({
      where: {
        userId,
        roleType: desiredRole,
        active: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return variant?.id ?? null;
  }

  private async collapseOpenSemanticDuplicates(userIds?: string[]) {
    const openStatuses = [
      OpportunityStatus.DISCOVERED,
      OpportunityStatus.QUALIFIED,
      OpportunityStatus.QUEUED_FOR_APPROVAL,
      OpportunityStatus.DISMISSED,
    ];

    const items = await this.prisma.opportunity.findMany({
      where: {
        ...(userIds?.length ? { userId: { in: userIds } } : {}),
        archivedAt: null,
        status: { in: openStatuses },
      },
      select: {
        id: true,
        userId: true,
        normalizedFingerprint: true,
        score: true,
        publishedAt: true,
        updatedAt: true,
      },
      orderBy: [{ score: 'desc' }, { publishedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    const kept = new Set<string>();
    const duplicateIds: string[] = [];

    for (const item of items) {
      const key = `${item.userId}:${item.normalizedFingerprint}`;
      if (kept.has(key)) {
        duplicateIds.push(item.id);
        continue;
      }
      kept.add(key);
    }

    if (!duplicateIds.length) {
      return 0;
    }

    const result = await this.prisma.opportunity.updateMany({
      where: { id: { in: duplicateIds } },
      data: {
        archivedAt: new Date(),
        workflowDecision: WorkflowDecision.DISMISSED_DUPLICATE,
        workflowReasons: ['Archived as a semantic duplicate after discovery.'],
      },
    });

    return result.count;
  }
}

function buildSourceStats(results: DiscoverySourceResult[]) {
  return results.reduce<
    Record<
      string,
      {
        discovered: number;
        inserted: number;
        updated: number;
        queued: number;
        filteredOutByScore: number;
        statusSummary: Partial<Record<OpportunityStatus, number>>;
      }
    >
  >((accumulator, result) => {
    accumulator[result.source] = {
      discovered: result.discovered,
      inserted: 0,
      updated: 0,
      queued: 0,
      filteredOutByScore: 0,
      statusSummary: {},
    };
    return accumulator;
  }, {});
}

function buildQueueAllowance(
  postingCandidates: Array<{
    posting: { sourcePostingId: string; applyEmail: string | null; publishedAt: Date | null };
    selection: { profile: ProfileWithDefaultCv; evaluation: ProfileEvaluation } | null;
  }>,
) {
  const groups = new Map<string, typeof postingCandidates>();

  for (const candidate of postingCandidates) {
    if (
      !candidate.selection ||
      !candidate.posting.applyEmail ||
      candidate.selection.evaluation.eligibility === Eligibility.FAIL ||
      candidate.selection.evaluation.finalScore < 0.16
    ) {
      continue;
    }

    const key = candidate.selection.profile.id;
    const bucket = groups.get(key) ?? [];
    bucket.push(candidate);
    groups.set(key, bucket);
  }

  const allowed = new Set<string>();
  for (const [profileId, bucket] of groups.entries()) {
    const sorted = [...bucket].sort((left, right) => {
      const scoreDiff =
        (right.selection?.evaluation.finalScore ?? 0) - (left.selection?.evaluation.finalScore ?? 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return (right.posting.publishedAt?.getTime() ?? 0) - (left.posting.publishedAt?.getTime() ?? 0);
    });
    const limit = sorted[0]?.selection?.profile.dailyLimit ?? 0;
    for (const candidate of sorted.slice(0, limit)) {
      if (candidate.selection) {
        allowed.add(`${candidate.posting.sourcePostingId}:${profileId}`);
      }
    }
  }

  return allowed;
}

function hasTrackerDuplicate(
  applications: Array<{ company: string; position: string; jobUrl: string | null }>,
  posting: { company: string; title: string; applyUrl: string | null; sourceUrl: string },
) {
  const normalizedUrl = posting.applyUrl ?? posting.sourceUrl;
  const fingerprint = buildSemanticFingerprint(posting.company, posting.title);

  return applications.some(
    (application) =>
      (normalizedUrl ? application.jobUrl === normalizedUrl : false) ||
      buildSemanticFingerprint(application.company, application.position) === fingerprint,
  );
}

function mergeStatusSummary(
  target: Partial<Record<OpportunityStatus, number>>,
  source: Partial<Record<OpportunityStatus, number>>,
) {
  for (const [status, count] of Object.entries(source)) {
    const key = status as OpportunityStatus;
    target[key] = (target[key] ?? 0) + (count ?? 0);
  }
}

function emptyEvaluationSummary(): DiscoveryEvaluationSummary {
  return {
    pass: 0,
    unknown: 0,
    fail: 0,
    archived: 0,
    selectedByProfile: {},
  };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}
