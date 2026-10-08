import { Injectable, Logger } from '@nestjs/common';
import { OpportunitySource } from '@prisma/client';
import { ConnectorOpportunity, DiscoveryConnector } from './discovery-connector.interface';

type GreenhouseResponse = {
  jobs?: Array<{
    id: number;
    absolute_url?: string;
    title?: string;
    updated_at?: string;
    content?: string;
    location?: { name?: string };
    metadata?: Array<{ name?: string; value?: string }>;
    offices?: Array<{ name?: string }>;
  }>;
};

@Injectable()
export class GreenhouseConnector implements DiscoveryConnector {
  readonly source = OpportunitySource.GREENHOUSE;
  private readonly logger = new Logger(GreenhouseConnector.name);

  async discover(): Promise<ConnectorOpportunity[]> {
    const boards = (process.env.GREENHOUSE_BOARD_TOKENS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!boards.length) {
      return [];
    }

    const results = await Promise.all(
      boards.map(async (board) => {
        const url = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;

        try {
          const response = await fetch(url);
          if (!response.ok) {
            this.logger.warn(`Greenhouse board ${board} responded ${response.status}`);
            return [];
          }

          const payload = (await response.json()) as GreenhouseResponse;
          const opportunities = (payload.jobs ?? []).map<ConnectorOpportunity>((job) => {
            const metadataText = (job.metadata ?? [])
              .map((entry) => `${entry.name ?? ''} ${entry.value ?? ''}`.trim())
              .join(' ');
            const offices = (job.offices ?? []).map((office) => office.name).filter(Boolean).join(', ');
            const applyEmail = extractEmail(`${job.content ?? ''} ${metadataText}`);

            return {
              externalId: `${board}:${job.id}`,
              source: this.source,
              sourceUrl: job.absolute_url ?? url,
              company: board,
              title: job.title ?? 'Untitled opportunity',
              description: [stripHtml(job.content ?? ''), metadataText].filter(Boolean).join('\n\n'),
              location: job.location?.name ?? (offices || null),
              remote: /(remote|remoto)/i.test(`${job.title ?? ''} ${job.content ?? ''} ${metadataText}`),
              publishedAt: job.updated_at ? new Date(job.updated_at) : null,
              applyEmail,
              applyUrl: job.absolute_url ?? null,
            };
          });
          this.logger.log(`Fetched ${opportunities.length} opportunities from Greenhouse board ${board}.`);
          return opportunities;
        } catch (error) {
          this.logger.warn(`Failed to discover Greenhouse board ${board}: ${toErrorMessage(error)}`);
          return [];
        }
      }),
    );

    return results.flat();
  }
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
