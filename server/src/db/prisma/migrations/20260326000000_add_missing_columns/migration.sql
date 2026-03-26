-- Add voiceSessionId, savedMealId, mealInstanceId to FoodEntry
ALTER TABLE "FoodEntry" ADD COLUMN IF NOT EXISTS "voiceSessionId" TEXT;
ALTER TABLE "FoodEntry" ADD COLUMN IF NOT EXISTS "savedMealId" TEXT;
ALTER TABLE "FoodEntry" ADD COLUMN IF NOT EXISTS "mealInstanceId" TEXT;

-- Add brandName and barcode to CustomFood
ALTER TABLE "CustomFood" ADD COLUMN IF NOT EXISTS "brandName" TEXT;
ALTER TABLE "CustomFood" ADD COLUMN IF NOT EXISTS "barcode" TEXT;

-- Create SavedMeal table
CREATE TABLE IF NOT EXISTS "SavedMeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedMeal_pkey" PRIMARY KEY ("id")
);

-- Create SavedMealItem table
CREATE TABLE IF NOT EXISTS "SavedMealItem" (
    "id" TEXT NOT NULL,
    "savedMealId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "carbsG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "usdaFdcId" INTEGER,
    "customFoodId" TEXT,
    "communityFoodId" TEXT,
    CONSTRAINT "SavedMealItem_pkey" PRIMARY KEY ("id")
);

-- Add indexes
CREATE INDEX IF NOT EXISTS "FoodEntry_userId_date_voiceSessionId_idx" ON "FoodEntry"("userId", "date", "voiceSessionId");
CREATE INDEX IF NOT EXISTS "CustomFood_userId_barcode_idx" ON "CustomFood"("userId", "barcode");
CREATE INDEX IF NOT EXISTS "SavedMeal_userId_idx" ON "SavedMeal"("userId");

-- Add foreign keys
ALTER TABLE "FoodEntry" ADD CONSTRAINT "FoodEntry_voiceSessionId_fkey"
    FOREIGN KEY ("voiceSessionId") REFERENCES "VoiceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SavedMeal" ADD CONSTRAINT "SavedMeal_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SavedMealItem" ADD CONSTRAINT "SavedMealItem_savedMealId_fkey"
    FOREIGN KEY ("savedMealId") REFERENCES "SavedMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
