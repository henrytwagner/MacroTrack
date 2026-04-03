-- AlterEnum
ALTER TYPE "FoodSource" ADD VALUE 'DIALED';

-- CreateIndex
CREATE INDEX "CommunityFood_dataSource_idx" ON "CommunityFood"("dataSource");
