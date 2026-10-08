import { Injectable, Logger } from '@nestjs/common';
import { OpportunitySource } from '@prisma/client';
import { ConnectorOpportunity, DiscoveryConnector } from './discovery-connector.interface';

@Injectable()
export class GetOnBoardConnector implements DiscoveryConnector {
  readonly source = OpportunitySource.GET_ON_BOARD;
  private readonly logger = new Logger(GetOnBoardConnector.name);

  async discover(): Promise<ConnectorOpportunity[]> {
    const feedUrl =
      process.env.GETONBOARD_FEED_URL ??
      process.env.GETONBOARD_DISCOVERY_URL ??
      'https://www.getonbrd.com/jobs/feed';

    try {
      const feedResponse = await fetch(feedUrl, {
        headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1' },
      });
      if (!feedResponse.ok) {
        this.logger.warn(`Get on Board feed responded ${feedResponse.status}`);
        return [];
      }

      const feedXml = await feedResponse.text();
      const jobs = [
        ...feedXml.matchAll(/<job>([\s\S]*?)<\/job>/gi),
        ...feedXml.matchAll(/<item>([\s\S]*?)<\/item>/gi),
      ]
        .map((match) => match[1])
        .slice(0, 60);

      const opportunities = jobs
        .map<ConnectorOpportunity | null>((jobXml) => {
          const link = decodeXml(
            extractCdata(jobXml, 'url') ??
              extractFirst(jobXml, /<url>([\s\S]*?)<\/url>/i) ??
              extractFirst(jobXml, /<link>([\s\S]*?)<\/link>/i) ??
              '',
          ).trim();
          const titleRaw = decodeXml(
            extractCdata(jobXml, 'title') ??
              extractFirst(jobXml, /<title>([\s\S]*?)<\/title>/i) ??
              '',
          ).trim();
          const descriptionRaw = decodeXml(
            extractCdata(jobXml, 'description') ??
              extractFirst(jobXml, /<description>([\s\S]*?)<\/description>/i) ??
              '',
          ).trim();
          const guid = decodeXml(
            extractCdata(jobXml, 'referencenumber') ??
              extractFirst(jobXml, /<referencenumber>([\s\S]*?)<\/referencenumber>/i) ??
              extractFirst(jobXml, /<id>([\s\S]*?)<\/id>/i) ??
              extractFirst(jobXml, /<guid[^>]*>([\s\S]*?)<\/guid>/i) ??
              link,
          ).trim();
          const company = decodeXml(
            extractCdata(jobXml, 'company') ??
              extractFirst(jobXml, /<company>([\s\S]*?)<\/company>/i) ??
              extractCompany(titleRaw, descriptionRaw, link),
          ).trim();
          const country = decodeXml(
            extractCdata(jobXml, 'country') ??
              extractFirst(jobXml, /<country>([\s\S]*?)<\/country>/i) ??
              '',
          ).trim();
          const publishedAtValue = decodeXml(
            extractCdata(jobXml, 'date') ??
              extractFirst(jobXml, /<date>([\s\S]*?)<\/date>/i) ??
              extractFirst(jobXml, /<pubDate>([\s\S]*?)<\/pubDate>/i) ??
              '',
          ).trim();
          const publishedAt = publishedAtValue ? new Date(publishedAtValue) : null;
          const normalizedLink = link.startsWith('http') ? link : `https://www.getonbrd.com${link}`;

          if (!normalizedLink || !titleRaw) {
            return null;
          }

          return {
            externalId: guid || normalizedLink,
            source: this.source,
            sourceUrl: normalizedLink,
            company,
            title: normalizeTitle(titleRaw),
            description: stripHtml(descriptionRaw),
            location: extractLocation(country || descriptionRaw),
            remote: /(remote|remoto|latam|worldwide|anywhere)/i.test(
              `${titleRaw} ${country} ${descriptionRaw}`,
            ),
            publishedAt: isValidDate(publishedAt) ? publishedAt : null,
            applyEmail: extractEmail(descriptionRaw),
            applyUrl: normalizedLink,
          };
        })
        .filter((value): value is ConnectorOpportunity => value !== null);

      this.logger.log(`Fetched ${opportunities.length} opportunities from Get on Board feed.`);
      return opportunities;
    } catch (error) {
      this.logger.warn(`Failed to discover Get on Board opportunities: ${toErrorMessage(error)}`);
      return [];
    }
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractEmail(value: string) {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null;
}

function extractFirst(value: string, pattern: RegExp) {
  return value.match(pattern)?.[1]?.trim() ?? null;
}

function extractCdata(value: string, tagName: string) {
  return (
    value.match(new RegExp(`<${tagName}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, 'i'))?.[1] ??
    null
  );
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeTitle(title: string) {
  return title.replace(/\s+\|\s+Get on Board$/i, '').trim();
}

function extractCompany(title: string, description: string, link: string) {
  const fromTitle = title.match(/at\s+([^|]+)/i)?.[1]?.trim();
  const fromDescription = description.match(/at\s+([A-Z][^\n<]+)/)?.[1]?.trim();
  const fromLink = link.match(/\/companies\/([^/]+)/i)?.[1]?.replace(/-/g, ' ');

  return fromTitle || fromDescription || fromLink || 'Get on Board';
}

function extractLocation(description: string) {
  const match =
    description.match(/\b(Remote(?:\s*\([^)]+\))?)\b/i)?.[1] ??
    description.match(/\b(Buenos Aires|Argentina|Latam|LATAM|Chile|Mexico|Uruguay|Colombia)\b/i)?.[1];

  return match ?? null;
}

function isValidDate(value: Date | null) {
  return Boolean(value && !Number.isNaN(value.getTime()));
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}
