import { Injectable, Logger } from '@nestjs/common';
import { OpportunitySource } from '@prisma/client';
import { ConnectorOpportunity, DiscoveryConnector } from './discovery-connector.interface';

type LeverPosting = {
  id: string;
  hostedUrl?: string;
  text?: string;
  descriptionPlain?: string;
  additionalPlain?: string;
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
  };
  createdAt?: number;
};

@Injectable()
export class LeverConnector implements DiscoveryConnector {
  readonly source = OpportunitySource.LEVER;
  private readonly logger = new Logger(LeverConnector.name);

  async discover(): Promise<ConnectorOpportunity[]> {
    const companies = (process.env.LEVER_COMPANIES ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!companies.length) {
      return [];
    }

    const results = await Promise.all(
      companies.map(async (company) => {
        const url = `https://api.lever.co/v0/postings/${company}?mode=json`;

        try {
          const response = await fetch(url);
          if (!response.ok) {
            this.logger.warn(`Lever company ${company} responded ${response.status}`);
            return [];
          }

          const payload = (await response.json()) as LeverPosting[];
          const opportunities = payload.map<ConnectorOpportunity>((job) => {
            const body = `${job.descriptionPlain ?? ''}\n\n${job.additionalPlain ?? ''}`;
            return {
              externalId: `${company}:${job.id}`,
              source: this.source,
              sourceUrl: job.hostedUrl ?? url,
              company,
              title: job.text ?? 'Untitled opportunity',
              description: body.trim(),
              location: job.categories?.location ?? null,
              remote: /(remote|remoto)/i.test(
                `${job.text ?? ''} ${body} ${job.categories?.location ?? ''} ${job.categories?.commitment ?? ''}`,
              ),
              publishedAt: job.createdAt ? new Date(job.createdAt) : null,
              applyEmail: extractEmail(body),
              applyUrl: job.hostedUrl ?? null,
            };
          });
          this.logger.log(`Fetched ${opportunities.length} opportunities from Lever company ${company}.`);
          return opportunities;
        } catch (error) {
          this.logger.warn(`Failed to discover Lever company ${company}: ${toErrorMessage(error)}`);
          return [];
        }
      }),
    );

    return results.flat();
  }
}

function extractEmail(value: string) {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}
