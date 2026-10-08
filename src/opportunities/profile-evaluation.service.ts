import { Injectable } from '@nestjs/common';
import { Eligibility, SearchMatchMode } from '@prisma/client';
import {
  detectCountryAndRegion,
  normalizeLocationPreferences,
  normalizeSeniorityPreference,
  normalizeToken,
} from './discovery.helpers';
import {
  FeedbackPreferenceSummary,
  KeywordSupportTier,
  LocationTier,
  MatchingSummary,
  NormalizedPosting,
  PostingMacroRegion,
  ProfileEvaluation,
  ProfileWithDefaultCv,
  TargetMatchTier,
} from './discovery.types';

type FeedbackSignalInput = {
  decision: string;
  rating: number | null;
  reasonTags: string[];
  opportunity: {
    company: string;
    location: string | null;
  } | null;
};

type RemoteCompatibilityResult = {
  eligibility: Eligibility;
  reason: string;
  note?: string;
};

type LocationCompatibilityResult = {
  eligibility: Eligibility;
  reason: string;
  note?: string;
  tier: LocationTier;
};

type TargetMatchResult = {
  tier: TargetMatchTier;
  strongTitleSignal: boolean;
};

const roleNoiseTokens = new Set([
  'a',
  'an',
  'the',
  'de',
  'del',
  'la',
  'el',
  'y',
  'and',
  'for',
  'con',
  'jr',
  'junior',
  'semi-senior',
  'semisenior',
  'semi',
  'mid',
  'middle',
  'sr',
  'senior',
  'lead',
  'staff',
  'principal',
  'remote',
  'remoto',
  'hybrid',
  'hibrido',
  'hibrida',
  'full',
  'part',
  'time',
  'contract',
  'freelance',
  'worldwide',
  'global',
  'distributed',
  'onsite',
  'on',
  'site',
]);

const softRoleTokens = new Set([
  'developer',
  'desarrollador',
  'engineer',
  'ingeniero',
  'specialist',
  'analyst',
  'analista',
  'manager',
  'gerente',
  'lead',
  'senior',
  'junior',
  'software',
  'web',
]);

const importantShortTokens = new Set(['ai', 'ml', 'qa', 'ui', 'ux']);

@Injectable()
export class ProfileEvaluationService {
  buildFeedbackPreferences(signals: FeedbackSignalInput[]) {
    const favoriteCompanies = new Set<string>();
    const dislikedLocationTokens = new Set<string>();
    let backendPenaltyWeight = 0;
    let seniorityBoostWeight = 0;

    for (const signal of signals) {
      if (signal.reasonTags.includes('interesting-company') && signal.opportunity?.company) {
        favoriteCompanies.add(normalizeToken(signal.opportunity.company));
      }

      if (signal.reasonTags.includes('bad-location') && signal.opportunity?.location) {
        for (const token of normalizeLocationPreferences([signal.opportunity.location])) {
          dislikedLocationTokens.add(token);
        }
      }

      if (signal.reasonTags.includes('too-backend')) {
        backendPenaltyWeight = Math.min(0.12, backendPenaltyWeight + 0.03);
      }

      if (signal.reasonTags.includes('good-seniority')) {
        seniorityBoostWeight = Math.min(0.08, seniorityBoostWeight + 0.02);
      }
    }

    return {
      favoriteCompanies,
      dislikedLocationTokens,
      backendPenaltyWeight,
      seniorityBoostWeight,
    } satisfies FeedbackPreferenceSummary;
  }

  evaluatePostingForProfile(
    profile: ProfileWithDefaultCv,
    posting: NormalizedPosting,
    feedbackPreferences: FeedbackPreferenceSummary,
  ) {
    const normalizedTitle = normalizeRoleText(posting.title, posting.locationTokens);
    const normalizedDescription = normalizeRoleText(
      posting.description,
      posting.locationTokens,
    );
    const keywordSupportTier = evaluateKeywordSupportTier(
      profile.keywords,
      normalizedTitle,
      normalizedDescription,
      posting.techSignals,
    );
    const targetMatch = evaluateTargetMatchTier(
      profile.roleTargets,
      normalizedTitle,
      normalizedDescription,
      keywordSupportTier,
    );
    const locationCompatibility = evaluateLocationCompatibility(profile.locations, posting);
    const remoteCompatibility = evaluateRemoteCompatibility(profile.remotePolicy, posting);

    const matchedSignals: string[] = [];
    const penalties: string[] = [];
    const notes: string[] = [];
    const eligibilityReasons = new Set<string>();

    pushTargetSignals(matchedSignals, targetMatch.tier);
    pushKeywordSignals(matchedSignals, keywordSupportTier, posting.techSignals, profile.keywords);

    if (locationCompatibility.note) {
      matchedSignals.push(locationCompatibility.note);
    }

    if (targetMatch.tier === 0 && keywordSupportTier === 0) {
      eligibilityReasons.add('no_semantic_match');
    } else if (targetMatch.tier === 0) {
      eligibilityReasons.add('role_mismatch');
    } else if (targetMatch.tier === 1) {
      eligibilityReasons.add('target_signal_missing');
    }

    if (remoteCompatibility.eligibility !== Eligibility.PASS) {
      eligibilityReasons.add(remoteCompatibility.reason);
    } else if (remoteCompatibility.note) {
      matchedSignals.push(remoteCompatibility.note);
    }

    if (locationCompatibility.eligibility !== Eligibility.PASS) {
      eligibilityReasons.add(locationCompatibility.reason);
    }

    const seniorityPreference = normalizeSeniorityPreference(profile.seniority);
    if (seniorityPreference) {
      if (
        posting.senioritySignals.includes(seniorityPreference) ||
        (seniorityPreference === 'senior' && posting.senioritySignals.includes('lead'))
      ) {
        matchedSignals.push(`seniority:${seniorityPreference}`);
      } else if (posting.senioritySignals.length) {
        penalties.push(`seniority_mismatch:${seniorityPreference}`);
        notes.push(`Seniority detectado: ${posting.senioritySignals.join(', ')}.`);
      } else {
        notes.push('Seniority no detectable en la vacante.');
      }
    }

    if (profile.matchingMode === SearchMatchMode.STRICT && !targetMatch.strongTitleSignal) {
      eligibilityReasons.add('strict_title_signal_missing');
    }

    const companyKey = normalizeToken(posting.company);
    let preferenceAdjustment = 0;
    if (feedbackPreferences.favoriteCompanies.has(companyKey)) {
      preferenceAdjustment += 0.06;
      matchedSignals.push('preferred_company');
    }

    if (
      posting.locationTokens.some((token) => feedbackPreferences.dislikedLocationTokens.has(token))
    ) {
      preferenceAdjustment -= 0.08;
      penalties.push('feedback_bad_location');
    }

    if (targetMatch.tier <= 1 && keywordSupportTier > 0 && feedbackPreferences.backendPenaltyWeight > 0) {
      preferenceAdjustment -= feedbackPreferences.backendPenaltyWeight;
      penalties.push('feedback_role_drift');
    }

    if (
      seniorityPreference &&
      posting.senioritySignals.includes(seniorityPreference) &&
      feedbackPreferences.seniorityBoostWeight > 0
    ) {
      preferenceAdjustment += feedbackPreferences.seniorityBoostWeight;
    }

    const relevanceScore = clamp01(
      targetTierScore(targetMatch.tier) +
        keywordTierScore(keywordSupportTier) +
        (matchedSignals.includes('seniority:senior') || matchedSignals.includes('seniority:mid')
          ? 0.04
          : 0),
    );
    const confidenceScore = clamp01(
      0.55 +
        (posting.description ? 0.15 : 0) +
        (posting.locationType !== 'UNKNOWN' ? 0.1 : 0) +
        (posting.countryCode || posting.macroRegion !== 'UNKNOWN' ? 0.1 : 0) +
        (posting.qualityFlags.length === 0 ? 0.1 : 0),
    );
    const finalScore = clamp01(relevanceScore * confidenceScore + preferenceAdjustment);

    const eligibility = resolveEligibility(
      profile.matchingMode,
      [...eligibilityReasons],
      remoteCompatibility.eligibility,
      locationCompatibility.tier,
      targetMatch.tier,
    );

    return {
      sourcePostingId: posting.sourcePostingId,
      searchProfileId: profile.id,
      profileName: profile.name,
      profileCreatedAt: profile.createdAt,
      matchingMode: profile.matchingMode,
      eligibility,
      eligibilityReasons: [...eligibilityReasons],
      relevanceScore: roundScore(relevanceScore),
      confidenceScore: roundScore(confidenceScore),
      finalScore: roundScore(finalScore),
      locationTier: locationCompatibility.tier,
      targetMatchTier: targetMatch.tier,
      keywordSupportTier,
      explanation: {
        matchedSignals: uniqueValues(matchedSignals),
        penalties: uniqueValues(penalties),
        notes: uniqueValues(notes),
      },
    } satisfies ProfileEvaluation;
  }

  buildMatchingSummary(profile: ProfileWithDefaultCv, evaluation: ProfileEvaluation) {
    return {
      selectedProfileId: profile.id,
      selectedProfileName: profile.name,
      eligibility: evaluation.eligibility,
      eligibilityReasons: evaluation.eligibilityReasons,
      relevanceScore: evaluation.relevanceScore,
      confidenceScore: evaluation.confidenceScore,
      finalScore: evaluation.finalScore,
      locationTier: evaluation.locationTier,
      targetMatchTier: evaluation.targetMatchTier,
      keywordSupportTier: evaluation.keywordSupportTier,
      locationLabel: locationTierLabel(evaluation.locationTier),
      targetLabel: targetTierLabel(evaluation.targetMatchTier),
      keywordSupportLabel: keywordTierLabel(evaluation.keywordSupportTier),
      matchedSignals: evaluation.explanation.matchedSignals,
      penalties: evaluation.explanation.penalties,
      notes: evaluation.explanation.notes,
    } satisfies MatchingSummary;
  }
}

function resolveEligibility(
  matchingMode: SearchMatchMode,
  reasons: string[],
  remoteEligibility: Eligibility,
  locationTier: LocationTier,
  targetMatchTier: TargetMatchTier,
) {
  if (reasons.includes('no_semantic_match') || reasons.includes('role_mismatch')) {
    return Eligibility.FAIL;
  }

  if (reasons.includes('strict_title_signal_missing')) {
    return Eligibility.FAIL;
  }

  if (remoteEligibility === Eligibility.FAIL || locationTier === 1 || targetMatchTier === 0) {
    return Eligibility.FAIL;
  }

  if (matchingMode === SearchMatchMode.STRICT && targetMatchTier < 3) {
    return Eligibility.FAIL;
  }

  if (locationTier === 2 || locationTier === 3 || remoteEligibility === Eligibility.UNKNOWN) {
    return matchingMode === SearchMatchMode.STRICT ? Eligibility.FAIL : Eligibility.UNKNOWN;
  }

  if (targetMatchTier === 1) {
    return matchingMode === SearchMatchMode.STRICT ? Eligibility.FAIL : Eligibility.UNKNOWN;
  }

  return Eligibility.PASS;
}

function evaluateRemoteCompatibility(
  remotePolicy: ProfileWithDefaultCv['remotePolicy'],
  posting: NormalizedPosting,
): RemoteCompatibilityResult {
  if (remotePolicy === 'ANY') {
    return { eligibility: Eligibility.PASS, reason: 'remote_policy_any' };
  }

  if (remotePolicy === 'REMOTE_ONLY') {
    if (posting.locationType === 'REMOTE') {
      return { eligibility: Eligibility.PASS, reason: 'remote_only_match', note: 'remote_match' };
    }
    if (posting.locationType === 'HYBRID' || posting.locationType === 'ONSITE') {
      return { eligibility: Eligibility.FAIL, reason: 'remote_mismatch' };
    }
    return { eligibility: Eligibility.UNKNOWN, reason: 'remote_unknown' };
  }

  if (posting.locationType === 'REMOTE' || posting.locationType === 'HYBRID') {
    return {
      eligibility: Eligibility.PASS,
      reason: 'hybrid_remote_match',
      note: 'remote_or_hybrid_match',
    };
  }

  if (posting.locationType === 'ONSITE') {
    return { eligibility: Eligibility.FAIL, reason: 'remote_mismatch' };
  }

  return { eligibility: Eligibility.UNKNOWN, reason: 'remote_unknown' };
}

function evaluateLocationCompatibility(
  locations: string[],
  posting: NormalizedPosting,
): LocationCompatibilityResult {
  const preferences = buildLocationPreferenceProfile(locations);
  if (!preferences.hasPreferences) {
    return { eligibility: Eligibility.PASS, reason: 'location_any', tier: 5 };
  }

  const hasExplicitLocation =
    posting.locationTokens.length > 0 ||
    posting.countryCode !== null ||
    posting.macroRegion !== 'UNKNOWN';
  const hasSpecificGeoSignal =
    posting.countryCode !== null ||
    (posting.macroRegion !== 'UNKNOWN' && posting.macroRegion !== 'GLOBAL');
  const exactTokenMatch = posting.locationTokens.some((token) => preferences.exactTokens.has(token));

  if (exactTokenMatch) {
    return {
      eligibility: Eligibility.PASS,
      reason: 'location_match',
      note: 'location_exact',
      tier: 5,
    };
  }

  if (preferences.preferredRegions.has(posting.macroRegion)) {
    return {
      eligibility: Eligibility.PASS,
      reason: 'macro_region_match',
      note: 'location_region',
      tier: 4,
    };
  }

  if (!hasExplicitLocation) {
    return {
      eligibility: Eligibility.UNKNOWN,
      reason: posting.locationType === 'REMOTE' ? 'remote_global_location_unknown' : 'location_unknown',
      tier: posting.locationType === 'REMOTE' ? 3 : 2,
    };
  }

  if (
    posting.locationType === 'REMOTE' &&
    posting.remoteScope === 'GLOBAL' &&
    !hasSpecificGeoSignal
  ) {
    return {
      eligibility: Eligibility.UNKNOWN,
      reason: 'remote_global_location_unknown',
      tier: 3,
    };
  }

  if (!hasSpecificGeoSignal) {
    return {
      eligibility: Eligibility.UNKNOWN,
      reason: 'location_ambiguous',
      tier: 2,
    };
  }

  return { eligibility: Eligibility.FAIL, reason: 'geo_mismatch', tier: 1 };
}

function buildLocationPreferenceProfile(locations: string[]) {
  const exactTokens = new Set<string>();
  const preferredRegions = new Set<PostingMacroRegion>();
  let hasPreferences = false;

  for (const location of locations) {
    const normalized = normalizeToken(location);
    if (!normalized || normalized === 'remote' || normalized === 'remoto') {
      continue;
    }

    hasPreferences = true;
    const detected = detectCountryAndRegion(normalized);
    if (detected.countryCode) {
      for (const alias of detected.aliases) {
        exactTokens.add(normalizeToken(alias));
      }
      continue;
    }

    if (detected.macroRegion !== 'UNKNOWN' && detected.macroRegion !== 'GLOBAL') {
      preferredRegions.add(detected.macroRegion);
      continue;
    }

    exactTokens.add(normalized);
  }

  return { exactTokens, preferredRegions, hasPreferences };
}

function evaluateTargetMatchTier(
  roleTargets: string[],
  normalizedTitle: string,
  normalizedDescription: string,
  keywordSupportTier: KeywordSupportTier,
): TargetMatchResult {
  const titleTokens = tokenSet(normalizedTitle);
  const descriptionTokens = tokenSet(normalizedDescription);
  let bestTier: TargetMatchTier = 0;

  for (const roleTarget of roleTargets) {
    const normalizedTarget = normalizeRoleText(roleTarget);
    if (!normalizedTarget) {
      continue;
    }

    const targetTokens = tokenSet(normalizedTarget);
    const importantTokens = importantRoleTokens(targetTokens);
    const titleTier = evaluateTitleAgainstTarget(
      normalizedTitle,
      titleTokens,
      normalizedTarget,
      targetTokens,
      importantTokens,
    );

    if (titleTier > bestTier) {
      bestTier = titleTier;
      continue;
    }

    if (
      titleTier === 0 &&
      bestTier < 1 &&
      hasDescriptionSupport(normalizedDescription, descriptionTokens, targetTokens, importantTokens)
    ) {
      bestTier = 1;
    }
  }

  if (bestTier === 0 && keywordSupportTier > 0) {
    bestTier = 1;
  }

  return {
    tier: bestTier,
    strongTitleSignal: bestTier >= 3,
  };
}

function evaluateTitleAgainstTarget(
  normalizedTitle: string,
  titleTokens: Set<string>,
  normalizedTarget: string,
  targetTokens: Set<string>,
  importantTokens: Set<string>,
): TargetMatchTier {
  if (!normalizedTitle || !normalizedTarget) {
    return 0;
  }

  if (normalizedTitle === normalizedTarget) {
    return 5;
  }

  const importantOverlap = overlapRatio(importantTokens, titleTokens);
  const allOverlap = overlapRatio(targetTokens, titleTokens);
  const containsTargetPhrase = normalizedTitle.includes(normalizedTarget);

  if (containsTargetPhrase || (importantOverlap === 1 && allOverlap >= 0.75)) {
    return 4;
  }

  if (importantOverlap >= 0.67 || allOverlap >= 0.67) {
    return 3;
  }

  if (importantOverlap > 0 && allOverlap >= 0.34) {
    return 2;
  }

  return 0;
}

function hasDescriptionSupport(
  normalizedDescription: string,
  descriptionTokens: Set<string>,
  targetTokens: Set<string>,
  importantTokens: Set<string>,
) {
  if (!normalizedDescription) {
    return false;
  }

  return overlapRatio(importantTokens, descriptionTokens) > 0 || overlapRatio(targetTokens, descriptionTokens) >= 0.5;
}

function evaluateKeywordSupportTier(
  keywords: string[],
  normalizedTitle: string,
  normalizedDescription: string,
  techSignals: string[],
): KeywordSupportTier {
  const normalizedKeywords = keywords
    .map((keyword) => normalizeRoleText(keyword))
    .filter(Boolean);
  const titleMatches = new Set<string>();
  const descriptionMatches = new Set<string>();
  const techMatches = new Set<string>();

  for (const keyword of normalizedKeywords) {
    if (normalizedTitle.includes(keyword)) {
      titleMatches.add(keyword);
    }
    if (normalizedDescription.includes(keyword)) {
      descriptionMatches.add(keyword);
    }
  }

  const normalizedTechSignals = new Set(techSignals.map((signal) => normalizeToken(signal)));
  for (const keyword of normalizedKeywords) {
    if (normalizedTechSignals.has(keyword)) {
      techMatches.add(keyword);
    }
  }

  if (titleMatches.size + techMatches.size >= 2) {
    return 3;
  }

  if (titleMatches.size >= 1 || descriptionMatches.size + techMatches.size >= 2) {
    return 2;
  }

  if (descriptionMatches.size + techMatches.size >= 1) {
    return 1;
  }

  return 0;
}

function normalizeRoleText(value: string, locationTokens: string[] = []) {
  const removableTokens = new Set([
    ...roleNoiseTokens,
    ...locationTokens.flatMap((token) => normalizeToken(token).split(' ')),
  ]);

  const normalized = normalizeToken(value)
    .replace(/\bfront[\s-]+end\b/g, 'frontend')
    .replace(/\bfull[\s-]+stack\b/g, 'fullstack');

  return normalized
    .split(' ')
    .filter((token) => {
      if (!token) {
        return false;
      }
      if (removableTokens.has(token)) {
        return false;
      }
      if (/^\d+$/.test(token) || /^[a-z]{1,3}\d+$/.test(token)) {
        return false;
      }
      return true;
    })
    .join(' ')
    .trim();
}

function importantRoleTokens(tokens: Set<string>) {
  const important = new Set<string>();
  for (const token of tokens) {
    if ((token.length >= 4 || importantShortTokens.has(token)) && !softRoleTokens.has(token)) {
      important.add(token);
    }
  }

  if (important.size) {
    return important;
  }

  const nonSoftTokens = new Set<string>();
  for (const token of tokens) {
    if (!softRoleTokens.has(token)) {
      nonSoftTokens.add(token);
    }
  }

  return nonSoftTokens.size ? nonSoftTokens : new Set(tokens);
}

function overlapRatio(left: Set<string>, right: Set<string>) {
  if (!left.size) {
    return 0;
  }

  let matches = 0;
  for (const token of left) {
    if (right.has(token)) {
      matches += 1;
    }
  }

  return matches / left.size;
}

function tokenSet(value: string) {
  return new Set(value.split(' ').filter(Boolean));
}

function pushTargetSignals(target: string[], targetMatchTier: TargetMatchTier) {
  if (targetMatchTier === 5) {
    target.push('target_exact_match');
    return;
  }

  if (targetMatchTier === 4) {
    target.push('target_close_match');
    return;
  }

  if (targetMatchTier === 3) {
    target.push('target_strong_overlap');
    return;
  }

  if (targetMatchTier === 2) {
    target.push('target_partial_overlap');
  }
}

function pushKeywordSignals(
  target: string[],
  keywordSupportTier: KeywordSupportTier,
  techSignals: string[],
  profileKeywords: string[],
) {
  if (keywordSupportTier === 0) {
    return;
  }

  target.push('keyword_match');
  if (keywordSupportTier >= 2) {
    target.push(keywordSupportTier === 3 ? 'keyword_support_strong' : 'keyword_support_medium');
  }

  const normalizedKeywords = profileKeywords.map((keyword) => normalizeToken(keyword));
  for (const signal of techSignals) {
    const normalizedSignal = normalizeToken(signal);
    if (normalizedKeywords.some((keyword) => normalizedSignal.includes(keyword))) {
      target.push(`tech:${normalizedSignal}`);
    }
  }
}

function targetTierScore(targetMatchTier: TargetMatchTier) {
  switch (targetMatchTier) {
    case 5:
      return 0.78;
    case 4:
      return 0.66;
    case 3:
      return 0.5;
    case 2:
      return 0.34;
    case 1:
      return 0.2;
    case 0:
    default:
      return 0;
  }
}

function keywordTierScore(keywordSupportTier: KeywordSupportTier) {
  switch (keywordSupportTier) {
    case 3:
      return 0.16;
    case 2:
      return 0.1;
    case 1:
      return 0.04;
    case 0:
    default:
      return 0;
  }
}

function locationTierLabel(locationTier: LocationTier) {
  switch (locationTier) {
    case 5:
      return 'Exacta';
    case 4:
      return 'Region';
    case 3:
      return 'Remota sin geo';
    case 2:
      return 'Ambigua';
    case 1:
    default:
      return 'Fuera de zona';
  }
}

function targetTierLabel(targetMatchTier: TargetMatchTier) {
  switch (targetMatchTier) {
    case 5:
      return 'Exacto';
    case 4:
      return 'Muy cercano';
    case 3:
      return 'Cercano';
    case 2:
      return 'Parcial';
    case 1:
      return 'Solo keywords';
    case 0:
    default:
      return 'Mismatch';
  }
}

function keywordTierLabel(keywordSupportTier: KeywordSupportTier) {
  switch (keywordSupportTier) {
    case 3:
      return 'Fuerte';
    case 2:
      return 'Medio';
    case 1:
      return 'Debil';
    case 0:
    default:
      return 'Sin soporte';
  }
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function roundScore(value: number) {
  return Number(clamp01(value).toFixed(2));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
