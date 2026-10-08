import { OpportunitySource } from '@prisma/client';

export type ConnectorOpportunity = {
  externalId: string;
  source: OpportunitySource;
  sourceUrl: string;
  company: string;
  title: string;
  description: string;
  location?: string | null;
  remote?: boolean | null;
  publishedAt?: Date | null;
  applyEmail?: string | null;
  applyUrl?: string | null;
  payloadJson?: Record<string, unknown> | null;
};

export interface DiscoveryConnector {
  readonly source: OpportunitySource;
  discover(): Promise<ConnectorOpportunity[]>;
}
