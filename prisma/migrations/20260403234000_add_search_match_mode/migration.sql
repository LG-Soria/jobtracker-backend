CREATE TYPE "SearchMatchMode" AS ENUM ('STRICT', 'BALANCED', 'BROAD');

ALTER TABLE "SearchProfile"
ADD COLUMN "matchingMode" "SearchMatchMode" NOT NULL DEFAULT 'BALANCED';
