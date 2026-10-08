import { Injectable } from '@nestjs/common';
import { Eligibility, SearchMatchMode } from '@prisma/client';
import { MatchingSummary, ProfileEvaluation, ProfileWithDefaultCv } from './discovery.types';

@Injectable()
export class CandidateSelectionService {
  selectBestEvaluation(
    profiles: Map<string, ProfileWithDefaultCv>,
    evaluations: ProfileEvaluation[],
    buildSummary: (profile: ProfileWithDefaultCv, evaluation: ProfileEvaluation) => MatchingSummary,
  ) {
    if (!evaluations.length) {
      return null;
    }

    const sorted = [...evaluations].sort((left, right) => {
      const eligibilityDiff = eligibilityRank(right.eligibility) - eligibilityRank(left.eligibility);
      if (eligibilityDiff !== 0) {
        return eligibilityDiff;
      }

      const locationDiff = right.locationTier - left.locationTier;
      if (locationDiff !== 0) {
        return locationDiff;
      }

      const targetDiff = right.targetMatchTier - left.targetMatchTier;
      if (targetDiff !== 0) {
        return targetDiff;
      }

      const keywordDiff = right.keywordSupportTier - left.keywordSupportTier;
      if (keywordDiff !== 0) {
        return keywordDiff;
      }

      const scoreDiff = right.finalScore - left.finalScore;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const modeDiff = matchingModeRank(right.matchingMode) - matchingModeRank(left.matchingMode);
      if (modeDiff !== 0) {
        return modeDiff;
      }

      return left.profileCreatedAt.getTime() - right.profileCreatedAt.getTime();
    });

    const winner = sorted[0];
    const selectedProfile = profiles.get(winner.searchProfileId);
    if (!selectedProfile) {
      return null;
    }

    return {
      evaluation: winner,
      profile: selectedProfile,
      matchingSummary: buildSummary(selectedProfile, winner),
      allEvaluations: sorted,
    };
  }
}

function eligibilityRank(value: Eligibility) {
  switch (value) {
    case Eligibility.PASS:
      return 3;
    case Eligibility.UNKNOWN:
      return 2;
    case Eligibility.FAIL:
    default:
      return 1;
  }
}

function matchingModeRank(value: SearchMatchMode) {
  switch (value) {
    case SearchMatchMode.STRICT:
      return 3;
    case SearchMatchMode.BALANCED:
      return 2;
    case SearchMatchMode.BROAD:
    default:
      return 1;
  }
}
