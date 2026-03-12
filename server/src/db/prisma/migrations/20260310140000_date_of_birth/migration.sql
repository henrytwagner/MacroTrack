-- Add dateOfBirth (full date); backfill from birthYear then drop birthYear
ALTER TABLE "User" ADD COLUMN "dateOfBirth" DATE;

-- Backfill: use July 1 of birth year where we have birthYear
UPDATE "User"
SET "dateOfBirth" = ("birthYear"::text || '-07-01')::date
WHERE "birthYear" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN "birthYear";
