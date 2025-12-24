-- Track auditable events for job applications (append-only).
CREATE TYPE "JobApplicationHistoryType" AS ENUM ('CREATED', 'STATUS_CHANGED');

CREATE TABLE "JobApplicationHistory" (
    "id" TEXT NOT NULL,
    "jobApplicationId" TEXT NOT NULL,
    "type" "JobApplicationHistoryType" NOT NULL,
    "meta" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    CONSTRAINT "JobApplicationHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobApplicationHistory_jobApplicationId_idx" ON "JobApplicationHistory"("jobApplicationId");
CREATE INDEX "JobApplicationHistory_createdAt_idx" ON "JobApplicationHistory"("createdAt");

ALTER TABLE "JobApplicationHistory"
  ADD CONSTRAINT "JobApplicationHistory_jobApplicationId_fkey"
  FOREIGN KEY ("jobApplicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobApplicationHistory"
  ADD CONSTRAINT "JobApplicationHistory_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
