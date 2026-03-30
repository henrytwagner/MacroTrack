-- DropIndex
DROP INDEX "idx_community_food_brand_trgm";

-- DropIndex
DROP INDEX "idx_community_food_name_trgm";

-- DropIndex
DROP INDEX "idx_custom_food_name_trgm";

-- DropIndex
DROP INDEX "idx_food_entry_name_trgm";

-- CreateTable
CREATE TABLE "WeightEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeightEntry_userId_date_idx" ON "WeightEntry"("userId", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "WeightEntry_userId_date_key" ON "WeightEntry"("userId", "date");

-- AddForeignKey
ALTER TABLE "WeightEntry" ADD CONSTRAINT "WeightEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
