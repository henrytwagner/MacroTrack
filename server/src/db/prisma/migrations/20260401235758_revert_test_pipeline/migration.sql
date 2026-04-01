/*
  Warnings:

  - You are about to drop the column `defaultLogQuantity` on the `CommunityFood` table. All the data in the column will be lost.
  - You are about to drop the column `defaultLogUnit` on the `CommunityFood` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `WaitlistEntry` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CommunityFood" DROP COLUMN "defaultLogQuantity",
DROP COLUMN "defaultLogUnit";

-- AlterTable
ALTER TABLE "WaitlistEntry" DROP COLUMN "source";

-- CreateTable
CREATE TABLE "UserFoodPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customFoodId" TEXT,
    "communityFoodId" TEXT,
    "usdaFdcId" INTEGER,
    "defaultQuantity" DOUBLE PRECISION,
    "defaultUnit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFoodPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserFoodPreference_userId_idx" ON "UserFoodPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFoodPreference_userId_customFoodId_key" ON "UserFoodPreference"("userId", "customFoodId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFoodPreference_userId_communityFoodId_key" ON "UserFoodPreference"("userId", "communityFoodId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFoodPreference_userId_usdaFdcId_key" ON "UserFoodPreference"("userId", "usdaFdcId");

-- AddForeignKey
ALTER TABLE "UserFoodPreference" ADD CONSTRAINT "UserFoodPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFoodPreference" ADD CONSTRAINT "UserFoodPreference_customFoodId_fkey" FOREIGN KEY ("customFoodId") REFERENCES "CustomFood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFoodPreference" ADD CONSTRAINT "UserFoodPreference_communityFoodId_fkey" FOREIGN KEY ("communityFoodId") REFERENCES "CommunityFood"("id") ON DELETE SET NULL ON UPDATE CASCADE;
