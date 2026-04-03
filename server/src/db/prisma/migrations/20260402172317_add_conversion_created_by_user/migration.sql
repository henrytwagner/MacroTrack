-- AlterTable
ALTER TABLE "FoodUnitConversion" ADD COLUMN     "createdByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "FoodUnitConversion" ADD CONSTRAINT "FoodUnitConversion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
