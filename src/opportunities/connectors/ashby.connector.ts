import { Injectable, Logger } from '@nestjs/common';
import { OpportunitySource } from '@prisma/client';
import { ConnectorOpportunity, DiscoveryConnector } from './discovery-connector.interface';

type AshbyJobBoardResponse = {
  jobs?: AshbyJob[];
};

type AshbyLocation =
  | string
  | {
      locationName?: string;
      officeName?: string;
      city?: string;
      region?: string;
      country?: string;
      countryCode?: string;
      isRemote?: boolean;
    };

type AshbyJob = {
  id?: string;
  jobUrl?: string;
  absoluteUrl?: string;
  title?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  employmentType?: string;
  location?: AshbyLocation | null;
  secondaryLocations?: AshbyLocation[] | null;
  team?: {
    name?: string;
  } | null;
};

@Injectable()
export class AshbyConnector implements DiscoveryConnector {
  readonly source = OpportunitySource.ASHBY;
  private readonly logger = new Logger(AshbyConnector.name);

  async discover(): Promise<ConnectorOpportunity[]> {
    const boardNames = (process.env.ASHBY_JOB_BOARD_NAMES ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!boardNames.length) {
      return [];
    }

    const results = await Promise.all(
      boardNames.map(async (boardName) => {
        const url = `https://api.ashbyhq.com/posting-api/job-board/${boardName}`;

        try {
          const response = await fetch(url, {
            headers: { Accept: 'application/json' },
          });

          if (!response.ok) {
            this.logger.warn(`Ashby board ${boardName} responded ${response.status}`);
            return [];
          }

          const payload = (await response.json()) as AshbyJobBoardResponse;
          const opportunities = (payload.jobs ?? [])
            .filter((job) => job.isListed !== false)
            .map<ConnectorOpportunity>((job) => {
              const description = stripHtml(job.descriptionPlain ?? job.descriptionHtml ?? '');
              const location = formatAshbyLocation(job.location, job.secondaryLocations);
              const sourceUrl = job.jobUrl ?? job.absoluteUrl ?? url;

              return {
                externalId: `${boardName}:${job.id ?? sourceUrl}`,
                source: this.source,
                sourceUrl,
                company: boardName,
                title: job.title?.trim() || 'Untitled opportunity',
                description,
                location,
                remote: detectRemote(job, description, location),
                publishedAt: parseDate(job.publishedAt ?? job.updatedAt ?? job.createdAt),
                applyEmail: extractEmail(description),
                applyUrl: sourceUrl,
              };
            });

          this.logger.log(`Fetched ${opportunities.length} opportunities from Ashby board ${boardName}.`);
          return opportunities;
        } catch (error) {
          this.logger.warn(`Failed to discover Ashby board ${boardName}: ${toErrorMessage(error)}`);
          return [];
        }
      }),
    );

    return results.flat();
  }
}

function formatAshbyLocation(location: AshbyLocation | null | undefined, secondaryLocations: AshbyLocation[] | null | undefined) {
  const primary = formatSingleLocation(location);
  const secondary = (secondaryLocations ?? [])
    .map((entry) => formatSingleLocation(entry))
    .filter(Boolean);

  return [primary, ...secondary].filter(Boolean).join(' / ') || null;
}

function formatSingleLocation(location: AshbyLocation | null | undefined) {
  if (!location) {
    return null;
  }

  if (typeof location === 'string') {
    return location.trim() || null;
  }

  const parts = [
    location.locationName,
    location.officeName,
    location.city,
    location.region,
    location.country,
    location.countryCode,
  ]
    .map((part) => part?.trim())
    .filter(Boolean);

  return parts.length ? parts.join(', ') : null;
}

function detectRemote(job: AshbyJob, description: string, location: string | null) {
  if (job.isRemote === true) {
    return true;
  }

  return /(remote|remoto|worldwide|anywhere)/i.test(
    `${job.title ?? ''} ${job.workplaceType ?? ''} ${location ?? ''} ${description}`,
  );
}

function parseDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractEmail(value: string) {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}
