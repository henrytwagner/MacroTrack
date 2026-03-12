-- New enums for profile, units, and goals
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'UNSPECIFIED');
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHT', 'MODERATE', 'HIGH', 'VERY_HIGH');
CREATE TYPE "UnitSystem" AS ENUM ('METRIC', 'IMPERIAL');
CREATE TYPE "GoalType" AS ENUM ('CUT', 'MAINTAIN', 'GAIN');
CREATE TYPE "GoalAggressiveness" AS ENUM ('MILD', 'STANDARD', 'AGGRESSIVE');

-- Extend User with profile fields and current goal profile
ALTER TABLE "User"
  ADD COLUMN "heightCm" DOUBLE PRECISION,
  ADD COLUMN "weightKg" DOUBLE PRECISION,
  ADD COLUMN "sex" "Sex" NOT NULL DEFAULT 'UNSPECIFIED',
  ADD COLUMN "birthYear" INTEGER,
  ADD COLUMN "activityLevel" "ActivityLevel",
  ADD COLUMN "preferredUnits" "UnitSystem" NOT NULL DEFAULT 'METRIC',
  ADD COLUMN "currentGoalProfileId" TEXT;

-- Goal profiles table
CREATE TABLE "GoalProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),

  CONSTRAINT "GoalProfile_pkey" PRIMARY KEY ("id")
);

-- Goal timeline table (effective-dated goals)
CREATE TABLE "GoalTimeline" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "profileId" TEXT,
  "effectiveDate" DATE NOT NULL,
  "calories" INTEGER NOT NULL,
  "proteinG" DOUBLE PRECISION NOT NULL,
  "carbsG" DOUBLE PRECISION NOT NULL,
  "fatG" DOUBLE PRECISION NOT NULL,
  "goalType" "GoalType" NOT NULL,
  "aggressiveness" "GoalAggressiveness" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GoalTimeline_pkey" PRIMARY KEY ("id")
);

-- Indices for efficient goal resolution
CREATE INDEX "GoalTimeline_userId_effectiveDate_idx"
  ON "GoalTimeline"("userId", "effectiveDate" DESC);

CREATE INDEX "GoalTimeline_profileId_effectiveDate_idx"
  ON "GoalTimeline"("profileId", "effectiveDate");

-- Foreign keys
ALTER TABLE "GoalProfile"
  ADD CONSTRAINT "GoalProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoalTimeline"
  ADD CONSTRAINT "GoalTimeline_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoalTimeline"
  ADD CONSTRAINT "GoalTimeline_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GoalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User"
  ADD CONSTRAINT "User_currentGoalProfileId_fkey"
  FOREIGN KEY ("currentGoalProfileId") REFERENCES "GoalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One-time backfill: migrate existing DailyGoal into a default profile and timeline row
INSERT INTO "GoalProfile" ("id", "userId", "name", "createdAt")
SELECT
  gen_random_uuid(),
  dg."userId",
  'Default Goals',
  NOW()
FROM "DailyGoal" dg
LEFT JOIN "GoalProfile" gp ON gp."userId" = dg."userId"
WHERE gp."id" IS NULL;

INSERT INTO "GoalTimeline" (
  "id",
  "userId",
  "profileId",
  "effectiveDate",
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "goalType",
  "aggressiveness",
  "createdAt"
)
SELECT
  gen_random_uuid(),
  dg."userId",
  gp."id",
  CURRENT_DATE,
  dg."calories",
  dg."proteinG",
  dg."carbsG",
  dg."fatG",
  'MAINTAIN'::"GoalType",
  'STANDARD'::"GoalAggressiveness",
  NOW()
FROM "DailyGoal" dg
JOIN "GoalProfile" gp ON gp."userId" = dg."userId";

