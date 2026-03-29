import { prisma } from "../db/client.js";
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
  tier: 1 | 2 | 3 | 4;
  score: number;
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

const TIER_SCORES: Record<number, number> = { 1: 1.0, 2: 0.9, 3: 0.7, 4: 0.5 };

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

async function searchUserHistory(
  query: NormalizedQuery,
  userId: string,
): Promise<ScoredCandidate[]> {
  const entries = await prisma.foodEntry.findMany({
    where: {
      userId,
      OR: [
        { name: { contains: query.canonical, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      name: true,
      quantity: true,
      unit: true,
      source: true,
      usdaFdcId: true,
      customFoodId: true,
      communityFoodId: true,
      calories: true,
      proteinG: true,
      carbsG: true,
      fatG: true,
    },
  });

  if (entries.length === 0) return [];

  // Group by food identity key
  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = entry.usdaFdcId
      ? `usda:${entry.usdaFdcId}`
      : entry.customFoodId
        ? `custom:${entry.customFoodId}`
        : entry.communityFoodId
          ? `community:${entry.communityFoodId}`
          : `name:${entry.name.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }

  const candidates: ScoredCandidate[] = [];
  for (const [key, group] of groups) {
    const mostRecent = group[0];
    const foodRef = key.startsWith("name:")
      ? key // No stable ref for name-only entries
      : key;

    // Skip name-only refs — they can't be resolved to a food_ref for add_to_draft
    if (key.startsWith("name:")) continue;

    candidates.push({
      foodRef,
      name: mostRecent.name,
      source: mostRecent.source as FoodSource,
      tier: 1,
      score: 0, // Computed later by rankAndSelect
      servingSize: mostRecent.quantity,
      servingUnit: mostRecent.unit,
      macros: {
        calories: mostRecent.calories,
        proteinG: mostRecent.proteinG,
        carbsG: mostRecent.carbsG,
        fatG: mostRecent.fatG,
      },
      logCount: group.length,
    });
  }

  return candidates;
}

async function searchCustomFoods(
  query: NormalizedQuery,
  userId: string,
): Promise<ScoredCandidate[]> {
  const results = await prisma.customFood.findMany({
    where: {
      userId,
      name: { contains: query.canonical, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      servingSize: true,
      servingUnit: true,
      calories: true,
      proteinG: true,
      carbsG: true,
      fatG: true,
    },
    take: 5,
  });

  return results.map((r) => ({
    foodRef: `custom:${r.id}`,
    name: r.name,
    source: "CUSTOM" as FoodSource,
    tier: 2 as const,
    score: 0,
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

async function searchCommunityFoods(
  query: NormalizedQuery,
): Promise<ScoredCandidate[]> {
  const results = await prisma.communityFood.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { name: { contains: query.canonical, mode: "insensitive" } },
        { brandName: { contains: query.canonical, mode: "insensitive" } },
      ],
    },
    orderBy: [{ trustScore: "desc" }, { usesCount: "desc" }],
    take: 5,
    select: {
      id: true,
      name: true,
      brandName: true,
      defaultServingSize: true,
      defaultServingUnit: true,
      calories: true,
      proteinG: true,
      carbsG: true,
      fatG: true,
      usesCount: true,
    },
  });

  return results.map((r) => ({
    foodRef: `community:${r.id}`,
    name: r.brandName ? `${r.brandName} — ${r.name}` : r.name,
    source: "COMMUNITY" as FoodSource,
    tier: 3 as const,
    score: 0,
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
  if (results.length > 0) return mapUsdaCandidates(results);

  // Attempt 2: all data types, standard timeout
  results = await searchFoodsEnhanced(query.canonical, {
    dataTypes: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
    pageSize: 10,
    timeoutMs: USDA_FALLBACK_TIMEOUT_MS,
  });
  if (results.length > 0) return mapUsdaCandidates(results);

  // Attempt 3: re-append cooking method if it was stripped
  if (query.cookingMethod) {
    const broadQuery = `${query.canonical} ${query.cookingMethod}`;
    results = await searchFoodsEnhanced(broadQuery, {
      dataTypes: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
      pageSize: 10,
      timeoutMs: USDA_FALLBACK_TIMEOUT_MS,
    });
    if (results.length > 0) return mapUsdaCandidates(results);
  }

  return [];
}

function mapUsdaCandidates(results: USDASearchResult[]): ScoredCandidate[] {
  return results.map((r) => ({
    foodRef: `usda:${r.fdcId}`,
    name: r.description,
    source: "DATABASE" as FoodSource,
    tier: 4 as const,
    score: 0,
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
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
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

function computeScore(candidate: ScoredCandidate, query: NormalizedQuery): number {
  // Tier preference
  const tierScore = TIER_SCORES[candidate.tier] ?? 0.5;

  // Name similarity (Jaccard index of tokens)
  const candidateTokens = tokenize(candidate.name);
  const nameScore = jaccardSimilarity(query.tokens, candidateTokens);

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

  // High confidence — auto-select
  if (top.score >= 0.75) {
    return candidateToFound(top);
  }

  // Moderate confidence with clear winner
  if (top.score >= 0.45 && candidates.length >= 2) {
    const gap = top.score - candidates[1].score;
    if (gap >= 0.15) {
      return candidateToFound(top);
    }

    // Close scores — disambiguate (up to 3 options)
    const options = candidates.slice(0, 3).map(candidateToOption);
    return { status: "multiple", options };
  }

  // Single candidate with moderate confidence
  if (top.score >= 0.45) {
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

  const [historyResults, customResults, communityResults, usdaResults] =
    await Promise.all([
      searchUserHistory(query, userId),
      searchCustomFoods(query, userId),
      searchCommunityFoods(query),
      searchUsdaWithFallback(query),
    ]);

  const allCandidates = [
    ...historyResults,
    ...customResults,
    ...communityResults,
    ...usdaResults,
  ];

  return rankAndSelect(allCandidates, query);
}
