-- CreateEnum
CREATE TYPE "FoodCategory" AS ENUM ('PROTEIN', 'DAIRY', 'GRAIN', 'FRUIT', 'VEGETABLE', 'FAT_OIL', 'BEVERAGE', 'CONDIMENT', 'SNACK', 'PREPARED_MEAL', 'LEGUME', 'OTHER');

-- DropForeignKey
ALTER TABLE "FoodUnitConversion" DROP CONSTRAINT "FoodUnitConversion_userId_fkey";

-- DropIndex
DROP INDEX "idx_community_food_brand_trgm";

-- DropIndex
DROP INDEX "idx_community_food_name_trgm";

-- DropIndex
DROP INDEX "idx_custom_food_name_trgm";

-- DropIndex
DROP INDEX "idx_food_entry_name_trgm";

-- AlterTable
ALTER TABLE "CommunityFood" ADD COLUMN     "addedSugarG" DOUBLE PRECISION,
ADD COLUMN     "calciumMg" DOUBLE PRECISION,
ADD COLUMN     "category" "FoodCategory",
ADD COLUMN     "commonName" TEXT,
ADD COLUMN     "dataSource" TEXT,
ADD COLUMN     "defaultLogQuantity" DOUBLE PRECISION,
ADD COLUMN     "defaultLogUnit" TEXT,
ADD COLUMN     "ironMg" DOUBLE PRECISION,
ADD COLUMN     "potassiumMg" DOUBLE PRECISION,
ADD COLUMN     "vitaminDMcg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "CustomFood" ADD COLUMN     "addedSugarG" DOUBLE PRECISION,
ADD COLUMN     "calciumMg" DOUBLE PRECISION,
ADD COLUMN     "category" "FoodCategory",
ADD COLUMN     "ironMg" DOUBLE PRECISION,
ADD COLUMN     "potassiumMg" DOUBLE PRECISION,
ADD COLUMN     "vitaminDMcg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "FoodUnitConversion" ADD COLUMN     "communityFoodId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CommunityFoodAlias" (
    "id" TEXT NOT NULL,
    "communityFoodId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityFoodAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityFoodAlias_alias_idx" ON "CommunityFoodAlias"("alias");

-- CreateIndex
CREATE INDEX "CommunityFoodAlias_communityFoodId_idx" ON "CommunityFoodAlias"("communityFoodId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_email_key" ON "WaitlistEntry"("email");

-- CreateIndex
CREATE INDEX "FoodUnitConversion_communityFoodId_unitName_idx" ON "FoodUnitConversion"("communityFoodId", "unitName");

-- AddForeignKey
ALTER TABLE "FoodUnitConversion" ADD CONSTRAINT "FoodUnitConversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodUnitConversion" ADD CONSTRAINT "FoodUnitConversion_communityFoodId_fkey" FOREIGN KEY ("communityFoodId") REFERENCES "CommunityFood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityFoodAlias" ADD CONSTRAINT "CommunityFoodAlias_communityFoodId_fkey" FOREIGN KEY ("communityFoodId") REFERENCES "CommunityFood"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RemoveEnumValue: Remap any existing AI_ESTIMATE rows, then recreate enum without it
UPDATE "FoodEntry" SET source = 'CUSTOM' WHERE source = 'AI_ESTIMATE';
UPDATE "SavedMealItem" SET source = 'CUSTOM' WHERE source = 'AI_ESTIMATE';
UPDATE "SearchLog" SET source = 'CUSTOM' WHERE source = 'AI_ESTIMATE';

ALTER TYPE "FoodSource" RENAME TO "FoodSource_old";
CREATE TYPE "FoodSource" AS ENUM ('DATABASE', 'CUSTOM', 'COMMUNITY');
ALTER TABLE "FoodEntry" ALTER COLUMN "source" TYPE "FoodSource" USING "source"::text::"FoodSource";
ALTER TABLE "SavedMealItem" ALTER COLUMN "source" TYPE "FoodSource" USING "source"::text::"FoodSource";
ALTER TABLE "SearchLog" ALTER COLUMN "source" TYPE "FoodSource" USING "source"::text::"FoodSource";
DROP TYPE "FoodSource_old";
