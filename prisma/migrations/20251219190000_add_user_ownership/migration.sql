-- Add Role enum required by users and auth
CREATE TYPE "Role" AS ENUM ('USER', 'DEMO');

-- Create users table so every business entity can link to its owner
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Ensure emails stay unique
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Add userId to JobApplication to enforce ownership
ALTER TABLE "JobApplication" ADD COLUMN "userId" TEXT;

-- Backfill existing applications to a default demo user so the NOT NULL + FK succeed
DO $$
DECLARE
  demo_user_id TEXT;
BEGIN
  SELECT "id" INTO demo_user_id FROM "User" WHERE "email" = 'demo@jobtracker.com';

  IF demo_user_id IS NULL THEN
    INSERT INTO "User" ("id", "email", "passwordHash", "role")
    VALUES (md5(random()::text || clock_timestamp()::text), 'demo@jobtracker.com',
            '$argon2id$v=19$m=65536,t=3,p=4$RiHAeirA4Yc6oUM9BvHTFg$i00Il1gBfnT/VFrWX4qrkvvYYb3O3mQ8nGgqfB6PmMU', 'DEMO')
    ON CONFLICT ("email") DO NOTHING;

    SELECT "id" INTO demo_user_id FROM "User" WHERE "email" = 'demo@jobtracker.com';
  END IF;

  -- Fallback safety: if for any reason the demo user was not created, stop to avoid NULL FK writes
  IF demo_user_id IS NULL THEN
    RAISE EXCEPTION 'Could not provision default demo user for ownership backfill';
  END IF;

  UPDATE "JobApplication" SET "userId" = demo_user_id WHERE "userId" IS NULL;
END $$;

-- Enforce the relationship at the DB level
ALTER TABLE "JobApplication" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "JobApplication"
ADD CONSTRAINT "JobApplication_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "JobApplication_userId_idx" ON "JobApplication"("userId");
