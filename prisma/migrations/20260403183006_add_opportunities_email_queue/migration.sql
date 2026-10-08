-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('FRONTEND', 'FULLSTACK');

-- CreateEnum
CREATE TYPE "RemotePolicy" AS ENUM ('REMOTE_ONLY', 'HYBRID_OR_REMOTE', 'ANY');

-- CreateEnum
CREATE TYPE "OpportunitySource" AS ENUM ('GET_ON_BOARD', 'GREENHOUSE', 'LEVER');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('DISCOVERED', 'QUALIFIED', 'QUEUED_FOR_APPROVAL', 'APPROVED', 'SENT', 'FAILED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "GuardDecision" AS ENUM ('PASS', 'BLOCK_DUPLICATE', 'BLOCK_NO_EMAIL', 'BLOCK_LOW_SCORE', 'BLOCK_BLACKLISTED');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('EMAIL', 'MANUAL_LINK');

-- CreateEnum
CREATE TYPE "ApplicationAttemptStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "FeedbackDecision" AS ENUM ('APPROVED', 'DISMISSED', 'WRONG_CV', 'BAD_MATCH');

-- CreateTable
CREATE TABLE "SearchProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleTargets" TEXT[],
    "keywords" TEXT[],
    "locations" TEXT[],
    "remotePolicy" "RemotePolicy" NOT NULL DEFAULT 'ANY',
    "seniority" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyLimit" INTEGER NOT NULL DEFAULT 20,
    "sources" "OpportunitySource"[],
    "userId" TEXT NOT NULL,
    "defaultCvVariantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvVariant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleType" "RoleType" NOT NULL,
    "filePath" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CvVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" "OpportunitySource" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "applyEmail" TEXT,
    "applyUrl" TEXT,
    "normalizedFingerprint" TEXT NOT NULL,
    "profileMatch" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "applyChannel" "DeliveryChannel" NOT NULL DEFAULT 'MANUAL_LINK',
    "status" "OpportunityStatus" NOT NULL DEFAULT 'DISCOVERED',
    "guardDecision" "GuardDecision" NOT NULL DEFAULT 'BLOCK_NO_EMAIL',
    "guardReason" TEXT,
    "userId" TEXT NOT NULL,
    "searchProfileId" TEXT,
    "cvVariantSuggestedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAttempt" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "cvVariantId" TEXT,
    "deliveryChannel" "DeliveryChannel" NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "status" "ApplicationAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackSignal" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decision" "FeedbackDecision" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchProfile_userId_idx" ON "SearchProfile"("userId");

-- CreateIndex
CREATE INDEX "SearchProfile_enabled_idx" ON "SearchProfile"("enabled");

-- CreateIndex
CREATE INDEX "CvVariant_userId_idx" ON "CvVariant"("userId");

-- CreateIndex
CREATE INDEX "CvVariant_active_idx" ON "CvVariant"("active");

-- CreateIndex
CREATE INDEX "Opportunity_normalizedFingerprint_idx" ON "Opportunity"("normalizedFingerprint");

-- CreateIndex
CREATE INDEX "Opportunity_status_idx" ON "Opportunity"("status");

-- CreateIndex
CREATE INDEX "Opportunity_publishedAt_idx" ON "Opportunity"("publishedAt");

-- CreateIndex
CREATE INDEX "Opportunity_userId_idx" ON "Opportunity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_userId_source_externalId_key" ON "Opportunity"("userId", "source", "externalId");

-- CreateIndex
CREATE INDEX "ApplicationAttempt_opportunityId_idx" ON "ApplicationAttempt"("opportunityId");

-- CreateIndex
CREATE INDEX "ApplicationAttempt_status_idx" ON "ApplicationAttempt"("status");

-- CreateIndex
CREATE INDEX "ApplicationAttempt_userId_idx" ON "ApplicationAttempt"("userId");

-- CreateIndex
CREATE INDEX "FeedbackSignal_opportunityId_idx" ON "FeedbackSignal"("opportunityId");

-- CreateIndex
CREATE INDEX "FeedbackSignal_userId_idx" ON "FeedbackSignal"("userId");

-- AddForeignKey
ALTER TABLE "SearchProfile" ADD CONSTRAINT "SearchProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchProfile" ADD CONSTRAINT "SearchProfile_defaultCvVariantId_fkey" FOREIGN KEY ("defaultCvVariantId") REFERENCES "CvVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvVariant" ADD CONSTRAINT "CvVariant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_searchProfileId_fkey" FOREIGN KEY ("searchProfileId") REFERENCES "SearchProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_cvVariantSuggestedId_fkey" FOREIGN KEY ("cvVariantSuggestedId") REFERENCES "CvVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAttempt" ADD CONSTRAINT "ApplicationAttempt_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAttempt" ADD CONSTRAINT "ApplicationAttempt_cvVariantId_fkey" FOREIGN KEY ("cvVariantId") REFERENCES "CvVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAttempt" ADD CONSTRAINT "ApplicationAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackSignal" ADD CONSTRAINT "FeedbackSignal_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackSignal" ADD CONSTRAINT "FeedbackSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
