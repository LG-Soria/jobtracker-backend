import { Injectable } from '@nestjs/common';
import { DeliveryChannel } from '@prisma/client';
import {
  buildSemanticFingerprint,
  detectCountryAndRegion,
  detectLocationType,
  detectRemoteScope,
  detectRoleSignals,
  detectSenioritySignals,
  detectTechSignals,
  extractEmail,
  normalizeToken,
  normalizeWhitespace,
  stripHtml,
} from './discovery.helpers';
import { NormalizedPosting, PersistedSourcePosting } from './discovery.types';

@Injectable()
export class PostingNormalizationService {
  normalize(posting: PersistedSourcePosting) {
    const payload = (posting.payloadJson ?? {}) as Record<string, unknown>;
    const title = normalizeWhitespace(posting.titleRaw);
    const description = stripHtml(posting.descriptionRaw);
    const combinedText = `${title} ${description} ${posting.locationRaw ?? ''}`;
    const locationText = normalizeWhitespace(posting.locationRaw ?? description);
    const directLocationEvidence = normalizeWhitespace(
      [posting.locationRaw ?? '', title].filter(Boolean).join(' '),
    );
    const fallbackLocationEvidence = normalizeWhitespace(description);
    const directCountryAndRegion = detectCountryAndRegion(directLocationEvidence);
    const countryAndRegion =
      directCountryAndRegion.countryCode !== null || directCountryAndRegion.macroRegion !== 'UNKNOWN'
        ? directCountryAndRegion
        : posting.locationRaw
          ? directCountryAndRegion
          : detectCountryAndRegion(fallbackLocationEvidence);
    const locationType = detectLocationType(`${title} ${locationText} ${description}`);
    const remoteScope = detectRemoteScope(`${title} ${locationText} ${description}`);
    const applyEmail =
      typeof payload.applyEmail === 'string'
        ? payload.applyEmail
        : extractEmail(`${description} ${JSON.stringify(payload)}`);
    const applyUrl =
      typeof payload.applyUrl === 'string' && payload.applyUrl.trim()
        ? payload.applyUrl
        : posting.sourceUrl;

    const locationTokens = new Set<string>();
    for (const token of countryAndRegion.aliases) {
      locationTokens.add(normalizeToken(token));
    }
    if (posting.locationRaw) {
      locationTokens.add(normalizeToken(posting.locationRaw));
    }

    return {
      sourcePostingId: posting.id,
      source: posting.source,
      externalId: posting.externalId,
      sourceUrl: posting.sourceUrl,
      company: normalizeWhitespace(posting.companyRaw),
      title,
      description,
      locationRaw: posting.locationRaw,
      publishedAt: posting.publishedAt,
      applyEmail,
      applyUrl,
      normalizedFingerprint: buildSemanticFingerprint(posting.companyRaw, title),
      roleSignals: detectRoleSignals(combinedText),
      techSignals: detectTechSignals(combinedText),
      senioritySignals: detectSenioritySignals(combinedText),
      locationTokens: [...locationTokens].filter(Boolean),
      countryCode: countryAndRegion.countryCode,
      macroRegion: countryAndRegion.macroRegion,
      locationType,
      remoteScope,
      isRemote: locationType === 'REMOTE' || locationType === 'HYBRID',
      applyChannel: applyEmail ? DeliveryChannel.EMAIL : DeliveryChannel.MANUAL_LINK,
      qualityFlags: [
        ...(description ? [] : ['missing_description']),
        ...(posting.locationRaw ? [] : ['missing_location']),
      ],
    } satisfies NormalizedPosting;
  }

  normalizeMany(postings: PersistedSourcePosting[]) {
    return postings.map((posting) => this.normalize(posting));
  }
}
