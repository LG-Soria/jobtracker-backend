-- Normalize JobStatus enum to technical values without spaces/accents for both DB and Prisma.
-- Existing values are stored as lowercase with spaces (e.g. 'en proceso').

-- Create the new enum with the canonical values.
CREATE TYPE "JobStatus_new" AS ENUM ('ENVIADA', 'EN_PROCESO', 'ENTREVISTA', 'RECHAZADA', 'SIN_RESPUESTA');

-- Migrate the column to the new enum, preserving existing data.
ALTER TABLE "JobApplication"
ALTER COLUMN "status" TYPE "JobStatus_new"
USING (
  UPPER(REPLACE("status"::text, ' ', '_'))::"JobStatus_new"
);

-- Drop the old enum and rename the new one to keep the original type name.
DROP TYPE "JobStatus";
ALTER TYPE "JobStatus_new" RENAME TO "JobStatus";
