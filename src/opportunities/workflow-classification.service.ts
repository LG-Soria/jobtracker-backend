import { Injectable } from '@nestjs/common';
import {
  Eligibility,
  GuardDecision,
  OpportunityStatus,
  SearchMatchMode,
  WorkflowDecision,
} from '@prisma/client';
import { MatchingSummary, NormalizedPosting, WorkflowClassification } from './discovery.types';

type WorkflowContext = {
  matchingMode: SearchMatchMode;
  withinDailyLimit: boolean;
  trackerDuplicate: boolean;
  recentApplicationDuplicate: boolean;
};

@Injectable()
export class WorkflowClassificationService {
  classify(
    posting: NormalizedPosting,
    matchingSummary: MatchingSummary,
    context: WorkflowContext,
  ) {
    const blacklist = splitEnvList(process.env.OPPORTUNITY_BLACKLIST);
    const haystack = `${posting.company} ${posting.title} ${posting.description}`.toLowerCase();

    if (blacklist.some((entry) => haystack.includes(entry))) {
      return this.result(
        WorkflowDecision.DISMISSED_POLICY,
        ['Matched blacklist entry.'],
        OpportunityStatus.DISMISSED,
        GuardDecision.BLOCK_BLACKLISTED,
        'Matched blacklist entry.',
        false,
      );
    }

    if (context.trackerDuplicate) {
      return this.result(
        WorkflowDecision.TRACKED_EXISTING,
        ['A similar opportunity already exists in the tracker.'],
        OpportunityStatus.DISMISSED,
        GuardDecision.BLOCK_DUPLICATE,
        'A similar opportunity is already registered in the tracker.',
        false,
      );
    }

    if (context.recentApplicationDuplicate) {
      return this.result(
        WorkflowDecision.DISMISSED_DUPLICATE,
        ['A similar opportunity was already applied recently.'],
        OpportunityStatus.DISMISSED,
        GuardDecision.BLOCK_DUPLICATE,
        'A similar opportunity was already applied recently.',
        false,
      );
    }

    if (matchingSummary.eligibility === Eligibility.FAIL) {
      return this.result(
        WorkflowDecision.DISMISSED_POLICY,
        matchingSummary.eligibilityReasons.length
          ? matchingSummary.eligibilityReasons
          : ['The opportunity does not satisfy the profile constraints.'],
        OpportunityStatus.DISMISSED,
        GuardDecision.BLOCK_LOW_SCORE,
        'The opportunity does not satisfy the profile constraints.',
        false,
      );
    }

    if (matchingSummary.finalScore < minimumScoreForMode(matchingSummary.eligibility, context.matchingMode)) {
      return this.result(
        WorkflowDecision.LOW_PRIORITY,
        ['Below the discovery threshold for this profile mode.'],
        OpportunityStatus.DISCOVERED,
        GuardDecision.BLOCK_LOW_SCORE,
        'Opportunity score below the discovery threshold.',
        false,
      );
    }

    if (!posting.applyEmail) {
      return this.result(
        WorkflowDecision.MANUAL_REVIEW,
        ['No application email detected. Requires manual review.'],
        OpportunityStatus.QUALIFIED,
        GuardDecision.BLOCK_NO_EMAIL,
        'No application email detected. Left for manual follow-up.',
        false,
      );
    }

    if (!context.withinDailyLimit) {
      return this.result(
        WorkflowDecision.LOW_PRIORITY,
        ['Outside the per-profile daily queue limit.'],
        OpportunityStatus.QUALIFIED,
        GuardDecision.PASS,
        'Eligible opportunity kept out of queue by the profile daily limit.',
        false,
      );
    }

    return this.result(
      WorkflowDecision.READY_FOR_QUEUE,
      ['Eligible opportunity ready for approval queue.'],
      OpportunityStatus.QUEUED_FOR_APPROVAL,
      GuardDecision.PASS,
      'Opportunity passed all automated checks and fits the queue.',
      true,
    );
  }

  private result(
    workflowDecision: WorkflowDecision,
    workflowReasons: string[],
    status: OpportunityStatus,
    guardDecision: GuardDecision,
    guardReason: string,
    queueEligible: boolean,
  ) {
    return {
      workflowDecision,
      workflowReasons,
      status,
      guardDecision,
      guardReason,
      queueEligible,
    } satisfies WorkflowClassification;
  }
}

function splitEnvList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function minimumScoreForMode(eligibility: Eligibility, mode: SearchMatchMode) {
  if (eligibility === Eligibility.UNKNOWN) {
    switch (mode) {
      case SearchMatchMode.BROAD:
        return 0.18;
      case SearchMatchMode.BALANCED:
        return 0.32;
      case SearchMatchMode.STRICT:
      default:
        return 1;
    }
  }

  switch (mode) {
    case SearchMatchMode.BROAD:
      return 0.16;
    case SearchMatchMode.BALANCED:
      return 0.28;
    case SearchMatchMode.STRICT:
    default:
      return 0.38;
  }
}

