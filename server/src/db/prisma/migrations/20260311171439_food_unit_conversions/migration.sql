-- CreateTable
CREATE TABLE "FoodUnitConversion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customFoodId" TEXT,
    "usdaFdcId" INTEGER,
    "unitName" TEXT NOT NULL,
    "quantityInBaseServings" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodUnitConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodUnitConversion_userId_customFoodId_unitName_idx" ON "FoodUnitConversion"("userId", "customFoodId", "unitName");

-- CreateIndex
CREATE INDEX "FoodUnitConversion_userId_usdaFdcId_unitName_idx" ON "FoodUnitConversion"("userId", "usdaFdcId", "unitName");

-- AddForeignKey
ALTER TABLE "FoodUnitConversion" ADD CONSTRAINT "FoodUnitConversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodUnitConversion" ADD CONSTRAINT "FoodUnitConversion_customFoodId_fkey" FOREIGN KEY ("customFoodId") REFERENCES "CustomFood"("id") ON DELETE SET NULL ON UPDATE CASCADE;
