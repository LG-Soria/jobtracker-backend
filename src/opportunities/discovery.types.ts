import {
  DeliveryChannel,
  Eligibility,
  GuardDecision,
  OpportunitySource,
  OpportunityStatus,
  SearchMatchMode,
  WorkflowDecision,
} from '@prisma/client';

export type ProfileWithDefaultCv = {
  id: string;
  name: string;
  roleTargets: string[];
  keywords: string[];
  locations: string[];
  remotePolicy: 'REMOTE_ONLY' | 'HYBRID_OR_REMOTE' | 'ANY';
  matchingMode: SearchMatchMode;
  seniority: string | null;
  enabled: boolean;
  dailyLimit: number;
  sources: OpportunitySource[];
  userId: string;
  defaultCvVariantId: string | null;
  createdAt: Date;
};

export type DiscoverySourceResult = {
  source: OpportunitySource;
  discovered: number;
  sourcePostings: PersistedSourcePosting[];
};

export type PersistedSourcePosting = {
  id: string;
  source: OpportunitySource;
  externalId: string;
  sourceUrl: string;
  companyRaw: string;
  titleRaw: string;
  descriptionRaw: string | null;
  locationRaw: string | null;
  publishedAt: Date | null;
  payloadJson: unknown;
};

export type PostingLocationType = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNKNOWN';
export type PostingMacroRegion =
  | 'LATAM'
  | 'NORTH_AMERICA'
  | 'EUROPE'
  | 'APAC'
  | 'MIDDLE_EAST_AFRICA'
  | 'GLOBAL'
  | 'UNKNOWN';

export type NormalizedPosting = {
  sourcePostingId: string;
  source: OpportunitySource;
  externalId: string;
  sourceUrl: string;
  company: string;
  title: string;
  description: string;
  locationRaw: string | null;
  publishedAt: Date | null;
  applyEmail: string | null;
  applyUrl: string | null;
  normalizedFingerprint: string;
  roleSignals: string[];
  techSignals: string[];
  senioritySignals: string[];
  locationTokens: string[];
  countryCode: string | null;
  macroRegion: PostingMacroRegion;
  locationType: PostingLocationType;
  remoteScope: string | null;
  isRemote: boolean;
  applyChannel: DeliveryChannel;
  qualityFlags: string[];
};

export type FeedbackPreferenceSummary = {
  favoriteCompanies: Set<string>;
  dislikedLocationTokens: Set<string>;
  backendPenaltyWeight: number;
  seniorityBoostWeight: number;
};

export type LocationTier = 1 | 2 | 3 | 4 | 5;
export type TargetMatchTier = 0 | 1 | 2 | 3 | 4 | 5;
export type KeywordSupportTier = 0 | 1 | 2 | 3;

export type ProfileEvaluation = {
  sourcePostingId: string;
  searchProfileId: string;
  profileName: string;
  profileCreatedAt: Date;
  matchingMode: SearchMatchMode;
  eligibility: Eligibility;
  eligibilityReasons: string[];
  relevanceScore: number;
  confidenceScore: number;
  finalScore: number;
  locationTier: LocationTier;
  targetMatchTier: TargetMatchTier;
  keywordSupportTier: KeywordSupportTier;
  explanation: {
    matchedSignals: string[];
    penalties: string[];
    notes: string[];
  };
};

export type MatchingSummary = {
  selectedProfileId: string;
  selectedProfileName: string;
  eligibility: Eligibility;
  eligibilityReasons: string[];
  relevanceScore: number;
  confidenceScore: number;
  finalScore: number;
  locationTier: LocationTier;
  targetMatchTier: TargetMatchTier;
  keywordSupportTier: KeywordSupportTier;
  locationLabel: string;
  targetLabel: string;
  keywordSupportLabel: string;
  matchedSignals: string[];
  penalties: string[];
  notes: string[];
};

export type WorkflowClassification = {
  workflowDecision: WorkflowDecision;
  workflowReasons: string[];
  status: OpportunityStatus;
  guardDecision: GuardDecision;
  guardReason: string;
  queueEligible: boolean;
};

export type EvaluationCandidate = {
  posting: NormalizedPosting;
  evaluation: ProfileEvaluation;
  matchingSummary: MatchingSummary;
};

export type DiscoveryEvaluationSummary = {
  pass: number;
  unknown: number;
  fail: number;
  archived: number;
  selectedByProfile: Record<string, number>;
};
