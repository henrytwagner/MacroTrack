-- CreateEnum
CREATE TYPE "CommunityFoodStatus" AS ENUM ('ACTIVE', 'PENDING', 'RETIRED');

-- CreateEnum
CREATE TYPE "BarcodeType" AS ENUM ('UPC_A', 'EAN_13', 'CODE_128', 'OTHER');

-- AlterEnum
ALTER TYPE "FoodSource" ADD VALUE 'COMMUNITY';

-- AlterTable
ALTER TABLE "FoodEntry" ADD COLUMN     "communityFoodId" TEXT;

-- CreateTable
CREATE TABLE "CommunityFood" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandName" TEXT,
    "description" TEXT,
    "defaultServingSize" DOUBLE PRECISION NOT NULL,
    "defaultServingUnit" TEXT NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "carbsG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "sodiumMg" DOUBLE PRECISION,
    "cholesterolMg" DOUBLE PRECISION,
    "fiberG" DOUBLE PRECISION,
    "sugarG" DOUBLE PRECISION,
    "saturatedFatG" DOUBLE PRECISION,
    "transFatG" DOUBLE PRECISION,
    "usdaFdcId" INTEGER,
    "createdByUserId" TEXT,
    "status" "CommunityFoodStatus" NOT NULL DEFAULT 'ACTIVE',
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "reportsCount" INTEGER NOT NULL DEFAULT 0,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityFood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityFoodBarcode" (
    "id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "type" "BarcodeType" NOT NULL DEFAULT 'OTHER',
    "communityFoodId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityFoodBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityFoodReport" (
    "id" TEXT NOT NULL,
    "communityFoodId" TEXT NOT NULL,
    "reporterUserId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityFoodReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityFood_name_idx" ON "CommunityFood"("name");

-- CreateIndex
CREATE INDEX "CommunityFood_status_idx" ON "CommunityFood"("status");

-- CreateIndex
CREATE INDEX "CommunityFood_usdaFdcId_idx" ON "CommunityFood"("usdaFdcId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityFoodBarcode_barcode_key" ON "CommunityFoodBarcode"("barcode");

-- AddForeignKey
ALTER TABLE "FoodEntry" ADD CONSTRAINT "FoodEntry_communityFoodId_fkey" FOREIGN KEY ("communityFoodId") REFERENCES "CommunityFood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityFood" ADD CONSTRAINT "CommunityFood_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityFoodBarcode" ADD CONSTRAINT "CommunityFoodBarcode_communityFoodId_fkey" FOREIGN KEY ("communityFoodId") REFERENCES "CommunityFood"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityFoodBarcode" ADD CONSTRAINT "CommunityFoodBarcode_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityFoodReport" ADD CONSTRAINT "CommunityFoodReport_communityFoodId_fkey" FOREIGN KEY ("communityFoodId") REFERENCES "CommunityFood"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityFoodReport" ADD CONSTRAINT "CommunityFoodReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
