-- AlterTable
ALTER TABLE "User" ADD COLUMN     "suppressUsdaWarning" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "USDAFoodMetrics" (
    "fdcId" INTEGER NOT NULL,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "lastUsedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "USDAFoodMetrics_pkey" PRIMARY KEY ("fdcId")
);

-- CreateIndex
CREATE INDEX "USDAFoodMetrics_usesCount_idx" ON "USDAFoodMetrics"("usesCount" DESC);
