-- CreateEnum
CREATE TYPE "Eligibility" AS ENUM ('PASS', 'UNKNOWN', 'FAIL');

-- CreateEnum
CREATE TYPE "WorkflowDecision" AS ENUM (
  'READY_FOR_QUEUE',
  'MANUAL_REVIEW',
  'LOW_PRIORITY',
  'DISMISSED_DUPLICATE',
  'DISMISSED_POLICY',
  'TRACKED_EXISTING'
);

-- CreateEnum
CREATE TYPE "DiscoveryRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "Opportunity"
ADD COLUMN "workflowDecision" "WorkflowDecision",
ADD COLUMN "workflowReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "matchingSummaryJson" JSONB,
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "sourcePostingId" TEXT,
ADD COLUMN "selectedEvaluationId" TEXT;

-- CreateTable
CREATE TABLE "SourcePosting" (
  "id" TEXT NOT NULL,
  "source" "OpportunitySource" NOT NULL,
  "externalId" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "companyRaw" TEXT NOT NULL,
  "titleRaw" TEXT NOT NULL,
  "descriptionRaw" TEXT,
  "locationRaw" TEXT,
  "publishedAt" TIMESTAMP(3),
  "payloadJson" JSONB,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SourcePosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostingEvaluation" (
  "id" TEXT NOT NULL,
  "sourcePostingId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "searchProfileId" TEXT NOT NULL,
  "eligibility" "Eligibility" NOT NULL,
  "eligibilityReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "finalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "selected" BOOLEAN NOT NULL DEFAULT false,
  "explanationJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PostingEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryRun" (
  "id" TEXT NOT NULL,
  "lockKey" TEXT NOT NULL,
  "status" "DiscoveryRunStatus" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "summaryJson" JSONB,
  "errorMessage" TEXT,
  "triggeredByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_selectedEvaluationId_key" ON "Opportunity"("selectedEvaluationId");

-- CreateIndex
CREATE INDEX "Opportunity_archivedAt_idx" ON "Opportunity"("archivedAt");

-- CreateIndex
CREATE INDEX "Opportunity_workflowDecision_idx" ON "Opportunity"("workflowDecision");

-- CreateIndex
CREATE INDEX "Opportunity_sourcePostingId_idx" ON "Opportunity"("sourcePostingId");

-- CreateIndex
CREATE UNIQUE INDEX "SourcePosting_source_externalId_key" ON "SourcePosting"("source", "externalId");

-- CreateIndex
CREATE INDEX "SourcePosting_source_publishedAt_idx" ON "SourcePosting"("source", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostingEvaluation_sourcePostingId_userId_searchProfileId_key" ON "PostingEvaluation"("sourcePostingId", "userId", "searchProfileId");

-- CreateIndex
CREATE INDEX "PostingEvaluation_userId_selected_idx" ON "PostingEvaluation"("userId", "selected");

-- CreateIndex
CREATE INDEX "PostingEvaluation_searchProfileId_idx" ON "PostingEvaluation"("searchProfileId");

-- CreateIndex
CREATE INDEX "DiscoveryRun_lockKey_status_idx" ON "DiscoveryRun"("lockKey", "status");

-- CreateIndex
CREATE INDEX "DiscoveryRun_startedAt_idx" ON "DiscoveryRun"("startedAt");

-- AddForeignKey
ALTER TABLE "Opportunity"
ADD CONSTRAINT "Opportunity_sourcePostingId_fkey" FOREIGN KEY ("sourcePostingId") REFERENCES "SourcePosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity"
ADD CONSTRAINT "Opportunity_selectedEvaluationId_fkey" FOREIGN KEY ("selectedEvaluationId") REFERENCES "PostingEvaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingEvaluation"
ADD CONSTRAINT "PostingEvaluation_sourcePostingId_fkey" FOREIGN KEY ("sourcePostingId") REFERENCES "SourcePosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingEvaluation"
ADD CONSTRAINT "PostingEvaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingEvaluation"
ADD CONSTRAINT "PostingEvaluation_searchProfileId_fkey" FOREIGN KEY ("searchProfileId") REFERENCES "SearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryRun"
ADD CONSTRAINT "DiscoveryRun_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
