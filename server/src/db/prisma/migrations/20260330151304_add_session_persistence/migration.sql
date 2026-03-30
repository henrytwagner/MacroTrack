-- AlterEnum
ALTER TYPE "SessionStatus" ADD VALUE 'paused';

-- AlterTable
ALTER TABLE "VoiceSession" ADD COLUMN "date" DATE,
ADD COLUMN "draftItems" JSONB,
ADD COLUMN "savedSnapshot" JSONB;

-- CreateIndex
CREATE INDEX "VoiceSession_userId_date_idx" ON "VoiceSession"("userId", "date");
