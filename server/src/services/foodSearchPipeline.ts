import { prisma, pool } from "../db/client.js";
import { searchFoodsEnhanced } from "./usda.js";
import type { FoodSource, USDASearchResult } from "../../../shared/types.js";
import type { KitchenLookupResult } from "./foodParser.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NormalizedQuery {
  original: string;
  canonical: string;
  tokens: string[];
  brand: string | null;
  cookingMethod: string | null;
}

interface ScoredCandidate {
  foodRef: string;
  name: string;
  source: FoodSource;
  tier: 1 | 2 | 2.5 | 3 | 4;
  score: number;
  trigramScore: number;
  servingSize: number;
  servingUnit: string;
  macros: { calories: number; proteinG: number; carbsG: number; fatG: number };
  dataType?: string;
  logCount?: number;
  usesCount?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COOKING_METHODS = new Set([
  "grilled", "fried", "baked", "roasted", "steamed", "raw", "boiled",
  "sauteed", "sautéed", "smoked", "broiled", "poached", "braised",
  "blanched", "charred",
]);

const IRREGULAR_PLURALS: Record<string, string> = {
  berries: "berry",
  cherries: "cherry",
  strawberries: "strawberry",
  blueberries: "blueberry",
  raspberries: "raspberry",
  blackberries: "blackberry",
  cranberries: "cranberry",
  potatoes: "potato",
  tomatoes: "tomato",
  mangoes: "mango",
  avocados: "avocado",
  tortillas: "tortilla",
  cookies: "cookie",
  brownies: "brownie",
  calories: "calorie",
  leaves: "leaf",
  loaves: "loaf",
  halves: "half",
  knives: "knife",
};

// Words that end in "s" but are already singular
const SINGULAR_EXCEPTIONS = new Set([
  "hummus", "couscous", "asparagus", "citrus", "octopus", "tofu",
  "edamame", "tempeh", "seitan", "quinoa", "granola", "tzatziki",
  "ricotta", "mozzarella", "falafel", "tahini", "sriracha", "teriyaki",
  "guacamole", "salsa", "peas", "oats", "grits", "shorts", "biscuits",
]);

const FILLER_WORDS = new Set([
  "a", "an", "the", "some", "of", "piece", "pieces", "serving",
  "servings", "slice", "slices", "cup", "cups", "bowl", "bowls",
]);

// Scoring weights
const WEIGHT_TIER = 0.30;
const WEIGHT_NAME = 0.35;
const WEIGHT_QUALITY = 0.20;
const WEIGHT_USAGE = 0.15;

const TIER_SCORES: Record<number, number> = { 1: 1.0, 2: 0.9, 2.5: 0.8, 3: 0.7, 4: 0.5 };

// USDA timeouts
const USDA_PREFERRED_TIMEOUT_MS = 3000;
const USDA_FALLBACK_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// Query Normalization
// ---------------------------------------------------------------------------

export function normalizeQuery(raw: string, brand?: string): NormalizedQuery {
  const original = raw.trim();
  let working = original.toLowerCase().trim();

  // Extract brand if provided
  let detectedBrand = brand?.trim() ?? null;

  // Remove brand from working string if embedded
  if (detectedBrand) {
    const brandLower = detectedBrand.toLowerCase();
    working = working.replace(brandLower, "").trim();
  }

  // Extract cooking methods
  const words = working.split(/\s+/);
  let cookingMethod: string | null = null;
  const filtered: string[] = [];
  for (const w of words) {
    if (COOKING_METHODS.has(w)) {
      cookingMethod = w;
    } else if (!FILLER_WORDS.has(w)) {
      filtered.push(w);
    }
  }

  // Singularize each token
  const tokens = filtered.map(singularize);
  const canonical = tokens.join(" ");

  return { original, canonical, tokens, brand: detectedBrand, cookingMethod };
}

function singularize(word: string): string {
  if (SINGULAR_EXCEPTIONS.has(word)) return word;
  if (IRREGULAR_PLURALS[word]) return IRREGULAR_PLURALS[word];

  // Simple English plural rules for food terms
  if (word.length > 3 && word.endsWith("ies")) {
    return word.slice(0, -3) + "y"; // "berries" handled by irregular, but catches others
  }
  if (word.length > 3 && word.endsWith("es") && !word.endsWith("ses") && !word.endsWith("zes")) {
    // "dishes" → "dish", "peaches" → "peach"
    const stem = word.slice(0, -2);
    if (stem.endsWith("sh") || stem.endsWith("ch") || stem.endsWith("x")) {
      return stem;
    }
  }
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) {
    return word.slice(0, -1);
  }
  return word;
}

// ---------------------------------------------------------------------------
// Tier Search Functions
// ---------------------------------------------------------------------------

interface HistoryRow {
  name: string;
  quantity: number;
  unit: string;
  source: string;
  usdaFdcId: number | null;
  customFoodId: string | null;
  communityFoodId: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sim: number;
  log_count: string; // bigint from COUNT comes as string
}

async function searchUserHistory(
  query: NormalizedQuery,
  userId: string,
): Promise<ScoredCandidate[]> {
  const { rows } = await pool.query<HistoryRow>(
    `SELECT DISTINCT ON (food_key)
       name, quantity, unit, source,
       "usdaFdcId", "customFoodId", "communityFoodId",
       calories, "proteinG", "carbsG", "fatG",
       GREATEST(similarity(name, $1), word_similarity($1, name)) AS sim,
       COUNT(*) OVER (
         PARTITION BY COALESCE("usdaFdcId"::text, "customFoodId", "communityFoodId")
       ) AS log_count,
       COALESCE("usdaFdcId"::text, "customFoodId", "communityFoodId") AS food_key
     FROM "FoodEntry"
     WHERE "userId" = $2
       AND (name % $1 OR word_similarity($1, name) > 0.25)
       AND ("usdaFdcId" IS NOT NULL OR "customFoodId" IS NOT NULL OR "communityFoodId" IS NOT NULL)
     ORDER BY food_key, sim DESC
     LIMIT 10`,
    [query.canonical, userId],
  );

  return rows.map((r) => {
    const foodRef = r.usdaFdcId
      ? `usda:${r.usdaFdcId}`
      : r.customFoodId
        ? `custom:${r.customFoodId}`
        : `community:${r.communityFoodId}`;
    return {
      foodRef,
      name: r.name,
      source: r.source as FoodSource,
      tier: 1 as const,
      score: 0,
      trigramScore: parseFloat(String(r.sim)) || 0,
      servingSize: r.quantity,
      servingUnit: r.unit,
      macros: {
        calories: r.calories,
        proteinG: r.proteinG,
        carbsG: r.carbsG,
        fatG: r.fatG,
      },
      logCount: parseInt(r.log_count, 10),
    };
  });
}

interface CustomFoodRow {
  id: string;
  name: string;
  servingSize: number;
  servingUnit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sim: number;
}

async function searchCustomFoods(
  query: NormalizedQuery,
  userId: string,
): Promise<ScoredCandidate[]> {
  const { rows } = await pool.query<CustomFoodRow>(
    `SELECT id, name, "servingSize", "servingUnit",
       calories, "proteinG", "carbsG", "fatG",
       GREATEST(similarity(name, $1), word_similarity($1, name)) AS sim
     FROM "CustomFood"
     WHERE "userId" = $2
       AND (name % $1 OR word_similarity($1, name) > 0.25)
     ORDER BY sim DESC
     LIMIT 5`,
    [query.canonical, userId],
  );

  return rows.map((r) => ({
    foodRef: `custom:${r.id}`,
    name: r.name,
    source: "CUSTOM" as FoodSource,
    tier: 2 as const,
    score: 0,
    trigramScore: parseFloat(String(r.sim)) || 0,
    servingSize: r.servingSize,
    servingUnit: r.servingUnit,
    macros: {
      calories: r.calories,
      proteinG: r.proteinG,
      carbsG: r.carbsG,
      fatG: r.fatG,
    },
  }));
}

async function searchDialedFoods(
  query: NormalizedQuery,
): Promise<ScoredCandidate[]> {
  const { rows } = await pool.query<CommunityFoodRow>(
    `SELECT cf.id, cf.name, cf."brandName", cf."commonName",
       cf."defaultServingSize", cf."defaultServingUnit",
       cf.calories, cf."proteinG", cf."carbsG", cf."fatG", cf."usesCount",
       GREATEST(
         similarity(cf.name, $1), word_similarity($1, cf.name),
         COALESCE(similarity(cf."commonName", $1), 0),
         COALESCE(word_similarity($1, cf."commonName"), 0),
         COALESCE(MAX(similarity(a.alias, $1)), 0),
         COALESCE(MAX(word_similarity($1, a.alias)), 0)
       ) AS sim
     FROM "CommunityFood" cf
     LEFT JOIN "CommunityFoodAlias" a ON a."communityFoodId" = cf.id
     WHERE cf.status = 'ACTIVE'
       AND cf."dataSource" = 'DIALED'
       AND (
         cf.name % $1
         OR cf."commonName" % $1
         OR word_similarity($1, cf.name) > 0.25
         OR word_similarity($1, cf."commonName") > 0.25
         OR a.alias % $1
         OR word_similarity($1, a.alias) > 0.25
       )
     GROUP BY cf.id
     ORDER BY sim DESC, cf."trustScore" DESC
     LIMIT 5`,
    [query.canonical],
  );

  return rows.map((r) => ({
    foodRef: `dialed:${r.id}`,
    name: r.brandName ? `${r.brandName} — ${r.name}` : r.name,
    source: "DIALED" as FoodSource,
    tier: 2.5 as const,
    score: 0,
    trigramScore: parseFloat(String(r.sim)) || 0,
    servingSize: r.defaultServingSize,
    servingUnit: r.defaultServingUnit,
    macros: {
      calories: r.calories,
      proteinG: r.proteinG,
      carbsG: r.carbsG,
      fatG: r.fatG,
    },
    usesCount: r.usesCount,
  }));
}

interface CommunityFoodRow {
  id: string;
  name: string;
  brandName: string | null;
  commonName: string | null;
  defaultServingSize: number;
  defaultServingUnit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  usesCount: number;
  sim: number;
}

async function searchCommunityFoods(
  query: NormalizedQuery,
): Promise<ScoredCandidate[]> {
  const { rows } = await pool.query<CommunityFoodRow>(
    `SELECT cf.id, cf.name, cf."brandName", cf."commonName",
       cf."defaultServingSize", cf."defaultServingUnit",
       cf.calories, cf."proteinG", cf."carbsG", cf."fatG", cf."usesCount",
       GREATEST(
         similarity(cf.name, $1), word_similarity($1, cf.name),
         COALESCE(similarity(cf."brandName", $1), 0),
         COALESCE(word_similarity($1, cf."brandName"), 0),
         COALESCE(similarity(cf."commonName", $1), 0),
         COALESCE(word_similarity($1, cf."commonName"), 0),
         COALESCE(MAX(similarity(a.alias, $1)), 0),
         COALESCE(MAX(word_similarity($1, a.alias)), 0)
       ) AS sim
     FROM "CommunityFood" cf
     LEFT JOIN "CommunityFoodAlias" a ON a."communityFoodId" = cf.id
     WHERE cf.status = 'ACTIVE'
       AND (cf."dataSource" IS DISTINCT FROM 'DIALED')
       AND (
         cf.name % $1
         OR cf."brandName" % $1
         OR cf."commonName" % $1
         OR word_similarity($1, cf.name) > 0.25
         OR word_similarity($1, cf."brandName") > 0.25
         OR word_similarity($1, cf."commonName") > 0.25
         OR a.alias % $1
         OR word_similarity($1, a.alias) > 0.25
       )
     GROUP BY cf.id
     ORDER BY sim DESC, cf."trustScore" DESC
     LIMIT 5`,
    [query.canonical],
  );

  return rows.map((r) => ({
    foodRef: `community:${r.id}`,
    name: r.brandName ? `${r.brandName} — ${r.name}` : r.name,
    source: "COMMUNITY" as FoodSource,
    tier: 3 as const,
    score: 0,
    trigramScore: parseFloat(String(r.sim)) || 0,
    servingSize: r.defaultServingSize,
    servingUnit: r.defaultServingUnit,
    macros: {
      calories: r.calories,
      proteinG: r.proteinG,
      carbsG: r.carbsG,
      fatG: r.fatG,
    },
    usesCount: r.usesCount,
  }));
}

async function searchUsdaWithFallback(
  query: NormalizedQuery,
): Promise<ScoredCandidate[]> {
  // Attempt 1: preferred data types only, tight timeout
  let results = await searchFoodsEnhanced(query.canonical, {
    dataTypes: ["Foundation", "SR Legacy"],
    pageSize: 5,
    timeoutMs: USDA_PREFERRED_TIMEOUT_MS,
  });
  if (results.length > 0) return mapUsdaCandidates(results, query);

  // Attempt 2: all data types, standard timeout
  results = await searchFoodsEnhanced(query.canonical, {
    dataTypes: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
    pageSize: 10,
    timeoutMs: USDA_FALLBACK_TIMEOUT_MS,
  });
  if (results.length > 0) return mapUsdaCandidates(results, query);

  // Attempt 3: re-append cooking method if it was stripped
  if (query.cookingMethod) {
    const broadQuery = `${query.canonical} ${query.cookingMethod}`;
    results = await searchFoodsEnhanced(broadQuery, {
      dataTypes: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
      pageSize: 10,
      timeoutMs: USDA_FALLBACK_TIMEOUT_MS,
    });
    if (results.length > 0) return mapUsdaCandidates(results, query);
  }

  return [];
}

function mapUsdaCandidates(results: USDASearchResult[], query: NormalizedQuery): ScoredCandidate[] {
  return results.map((r) => ({
    foodRef: `usda:${r.fdcId}`,
    name: r.description,
    source: "DATABASE" as FoodSource,
    tier: 4 as const,
    score: 0,
    trigramScore: jaccardSimilarity(query.tokens, tokenize(r.description)),
    servingSize: r.servingSize ?? 100,
    servingUnit: r.servingSizeUnit ?? "g",
    macros: {
      calories: r.macros.calories,
      proteinG: r.macros.proteinG,
      carbsG: r.macros.carbsG,
      fatG: r.macros.fatG,
    },
    dataType: r.dataType,
  }));
}

// ---------------------------------------------------------------------------
// Scoring & Selection
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean).map(singularize);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function computeScore(candidate: ScoredCandidate, _query: NormalizedQuery): number {
  // Tier preference
  const tierScore = TIER_SCORES[candidate.tier] ?? 0.5;

  // Name similarity — trigram score from DB for local tiers, Jaccard for USDA
  const nameScore = candidate.trigramScore;

  // Data quality
  let qualityScore = 0;
  if (candidate.servingSize > 0) qualityScore += 0.3;
  const m = candidate.macros;
  if (m.calories > 0 && m.proteinG > 0 && m.carbsG > 0 && m.fatG > 0) {
    qualityScore += 0.4;
  } else if (m.calories > 0) {
    qualityScore += 0.2;
  }
  if (candidate.dataType === "Foundation" || candidate.dataType === "SR Legacy") {
    qualityScore += 0.3;
  } else if (candidate.tier <= 3) {
    // Custom/community foods are curated — give them the quality boost
    qualityScore += 0.3;
  }

  // Dampen quality score for USDA — data completeness is always high for Foundation
  // and provides no signal about whether this is the correct food match.
  if (candidate.tier === 4) {
    qualityScore *= 0.5;
  }

  // Usage signal
  let usageScore = 0;
  if (candidate.logCount) {
    usageScore = Math.min(candidate.logCount / 10, 1.0);
  } else if (candidate.usesCount) {
    usageScore = Math.min(candidate.usesCount / 100, 1.0);
  }

  return (
    WEIGHT_TIER * tierScore +
    WEIGHT_NAME * nameScore +
    WEIGHT_QUALITY * qualityScore +
    WEIGHT_USAGE * usageScore
  );
}

// Minimum name similarity required for auto-select, per tier.
// Tier 1 (user history) and tier 2 (custom) have low thresholds because
// the user has explicitly created/logged these before.
// Tier 4 (USDA) requires strong name overlap to auto-select — quality score
// alone (data completeness) should never be enough.
const MIN_NAME_SCORE_FOR_AUTO_SELECT: Record<number, number> = {
  1: 0.25,   // User history — they've logged it before
  2: 0.25,   // Custom foods — user created it
  2.5: 0.30, // Dialed foods — curated baseline
  3: 0.35,   // Community foods
  4: 0.50,   // USDA — majority token overlap required
};

function rankAndSelect(
  candidates: ScoredCandidate[],
  query: NormalizedQuery,
): KitchenLookupResult {
  if (candidates.length === 0) {
    return { status: "not_found", name: query.original };
  }

  // Score all candidates
  for (const c of candidates) {
    c.score = computeScore(c, query);
  }

  // Sort descending by score
  candidates.sort((a, b) => b.score - a.score);

  const top = candidates[0];
  const minName = MIN_NAME_SCORE_FOR_AUTO_SELECT[top.tier] ?? 0.50;
  const nameOk = top.trigramScore >= minName;

  // High confidence — auto-select only if name match is adequate
  if (top.score >= 0.75 && nameOk) {
    return candidateToFound(top);
  }

  // Moderate confidence with clear winner
  if (top.score >= 0.55 && candidates.length >= 2 && nameOk) {
    const gap = top.score - candidates[1].score;
    if (gap >= 0.15) {
      return candidateToFound(top);
    }

    // Close scores — disambiguate (up to 3 options)
    const options = candidates.slice(0, 3).map(candidateToOption);
    return { status: "multiple", options };
  }

  // Single candidate with moderate confidence
  if (top.score >= 0.55 && nameOk) {
    return candidateToFound(top);
  }

  // Low confidence — not found
  return { status: "not_found", name: query.original };
}

function candidateToFound(c: ScoredCandidate): KitchenLookupResult & { status: "found" } {
  return {
    status: "found",
    foodRef: c.foodRef,
    name: c.name,
    source: c.source,
    servingSize: c.servingSize,
    servingUnit: c.servingUnit,
    caloriesPerServing: c.macros.calories,
    proteinGPerServing: c.macros.proteinG,
    carbsGPerServing: c.macros.carbsG,
    fatGPerServing: c.macros.fatG,
  };
}

function candidateToOption(c: ScoredCandidate) {
  return {
    foodRef: c.foodRef,
    name: c.name,
    source: "DATABASE" as const,
    caloriesPerServing: c.macros.calories,
    proteinGPerServing: c.macros.proteinG,
    carbsGPerServing: c.macros.carbsG,
    fatGPerServing: c.macros.fatG,
    servingSize: c.servingSize,
    servingUnit: c.servingUnit,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function lookupFoodPipeline(
  rawName: string,
  userId: string,
  brand?: string,
): Promise<KitchenLookupResult> {
  const query = normalizeQuery(rawName, brand);

  const [historyResults, customResults, dialedResults, communityResults, usdaResults] =
    await Promise.all([
      searchUserHistory(query, userId),
      searchCustomFoods(query, userId),
      searchDialedFoods(query),
      searchCommunityFoods(query),
      searchUsdaWithFallback(query),
    ]);

  const allCandidates = [
    ...historyResults,
    ...customResults,
    ...dialedResults,
    ...communityResults,
    ...usdaResults,
  ];

  const result = rankAndSelect(allCandidates, query);

  // Log search query and result (fire-and-forget for training data)
  logSearch(userId, query, result).catch(() => {});

  return result;
}

// ---------------------------------------------------------------------------
// Search Logging (training data collection)
// ---------------------------------------------------------------------------

async function logSearch(
  userId: string,
  query: NormalizedQuery,
  result: KitchenLookupResult,
): Promise<void> {
  const selectedFoodRef = result.status === "found" ? result.foodRef : null;
  const selectedName = result.status === "found" ? result.name : null;
  const source = result.status === "found" ? result.source : null;

  await prisma.searchLog.create({
    data: {
      userId,
      query: query.original,
      normalizedQuery: query.canonical,
      selectedFoodRef,
      selectedName,
      source,
      resultStatus: result.status,
    },
  });
}
