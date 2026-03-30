-- Enable pg_trgm extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for fuzzy search on food name columns
CREATE INDEX IF NOT EXISTS idx_food_entry_name_trgm ON "FoodEntry" USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_custom_food_name_trgm ON "CustomFood" USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_community_food_name_trgm ON "CommunityFood" USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_community_food_brand_trgm ON "CommunityFood" USING GIN ("brandName" gin_trgm_ops);

-- SearchLog table for collecting search query → result pairs (training data)
CREATE TABLE "SearchLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "selectedFoodRef" TEXT,
    "selectedName" TEXT,
    "source" "FoodSource",
    "resultStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SearchLog_userId_createdAt_idx" ON "SearchLog"("userId", "createdAt");
CREATE INDEX "SearchLog_query_idx" ON "SearchLog"("query");

ALTER TABLE "SearchLog" ADD CONSTRAINT "SearchLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
