import { Injectable, Logger } from '@nestjs/common';
import { OpportunitySource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorOpportunity } from './connectors/discovery-connector.interface';
import { AshbyConnector } from './connectors/ashby.connector';
import { GetOnBoardConnector } from './connectors/get-on-board.connector';
import { GreenhouseConnector } from './connectors/greenhouse.connector';
import { LeverConnector } from './connectors/lever.connector';
import { DiscoverySourceResult, PersistedSourcePosting } from './discovery.types';

@Injectable()
export class SourceIngestionService {
  private readonly logger = new Logger(SourceIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ashbyConnector: AshbyConnector,
    private readonly getOnBoardConnector: GetOnBoardConnector,
    private readonly greenhouseConnector: GreenhouseConnector,
    private readonly leverConnector: LeverConnector,
  ) {}

  async ingestAllSources() {
    const connectors = [
      this.getOnBoardConnector,
      this.greenhouseConnector,
      this.leverConnector,
      this.ashbyConnector,
    ];
    const results: DiscoverySourceResult[] = [];

    for (const connector of connectors) {
      const postings = await connector.discover();
      const sourcePostings = await this.persistSourcePostings(postings, connector.source);
      this.logger.log(`Ingestion for ${connector.source}: fetched ${postings.length}, persisted ${sourcePostings.length}.`);
      results.push({
        source: connector.source,
        discovered: postings.length,
        sourcePostings,
      });
    }

    return results;
  }

  async ingestImportedPostings(source: OpportunitySource, postings: ConnectorOpportunity[]) {
    const sourcePostings = await this.persistSourcePostings(postings, source);
    this.logger.log(
      `Imported ingestion for ${source}: received ${postings.length}, persisted ${sourcePostings.length}.`,
    );
    return {
      source,
      discovered: postings.length,
      sourcePostings,
    } satisfies DiscoverySourceResult;
  }

  private async persistSourcePostings(postings: ConnectorOpportunity[], source: OpportunitySource) {
    const persisted: PersistedSourcePosting[] = [];

    for (const posting of postings) {
      const record = await this.prisma.sourcePosting.upsert({
        where: {
          source_externalId: {
            source,
            externalId: posting.externalId,
          },
        },
        update: {
          sourceUrl: posting.sourceUrl,
          companyRaw: posting.company,
          titleRaw: posting.title,
          descriptionRaw: posting.description || null,
          locationRaw: posting.location ?? null,
          publishedAt: posting.publishedAt ?? null,
          payloadJson: posting.payloadJson ?? (posting as unknown as object),
          fetchedAt: new Date(),
        },
        create: {
          source,
          externalId: posting.externalId,
          sourceUrl: posting.sourceUrl,
          companyRaw: posting.company,
          titleRaw: posting.title,
          descriptionRaw: posting.description || null,
          locationRaw: posting.location ?? null,
          publishedAt: posting.publishedAt ?? null,
          payloadJson: posting.payloadJson ?? (posting as unknown as object),
        },
      });

      persisted.push({
        id: record.id,
        source: record.source,
        externalId: record.externalId,
        sourceUrl: record.sourceUrl,
        companyRaw: record.companyRaw,
        titleRaw: record.titleRaw,
        descriptionRaw: record.descriptionRaw,
        locationRaw: record.locationRaw,
        publishedAt: record.publishedAt,
        payloadJson: record.payloadJson,
      });
    }

    return persisted;
  }
}
