import type { Macros, USDASearchResult } from "../../../shared/types.js";

const USDA_BASE_URL = "https://api.nal.usda.gov/fdc/v1";
const MAX_RESULTS = 15;
const REQUEST_TIMEOUT_MS = 8000;

const NUTRIENT_IDS = {
  PROTEIN: 1003,
  FAT: 1004,
  CARBS: 1005,
  CALORIES: 1008,
} as const;

interface USDAFoodNutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  nutrientName?: string;
  value?: number;
  amount?: number;
  unitName?: string;
}

interface USDASearchFood {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: USDAFoodNutrient[];
}

interface USDASearchResponse {
  totalHits: number;
  currentPage: number;
  totalPages: number;
  foods: USDASearchFood[];
}

function getApiKey(): string {
  const key = process.env.USDA_API_KEY;
  if (!key || key === "your-usda-api-key-here") {
    throw new Error("USDA_API_KEY is not configured");
  }
  return key;
}

function extractNutrientValue(
  nutrients: USDAFoodNutrient[],
  nutrientId: number,
): number {
  for (const n of nutrients) {
    const id = n.nutrientId ?? (n.nutrientNumber ? parseInt(n.nutrientNumber, 10) : undefined);
    if (id === nutrientId) {
      return n.value ?? n.amount ?? 0;
    }
  }
  return 0;
}

function parseMacros(nutrients: USDAFoodNutrient[]): Macros {
  return {
    calories: Math.round(extractNutrientValue(nutrients, NUTRIENT_IDS.CALORIES)),
    proteinG: Math.round(extractNutrientValue(nutrients, NUTRIENT_IDS.PROTEIN) * 10) / 10,
    carbsG: Math.round(extractNutrientValue(nutrients, NUTRIENT_IDS.CARBS) * 10) / 10,
    fatG: Math.round(extractNutrientValue(nutrients, NUTRIENT_IDS.FAT) * 10) / 10,
  };
}

function mapFoodToResult(food: USDASearchFood): USDASearchResult {
  const macros = parseMacros(food.foodNutrients ?? []);
  return {
    fdcId: food.fdcId,
    description: food.description,
    brandName: food.brandOwner ?? food.brandName,
    dataType: food.dataType,
    servingSize: food.servingSize,
    servingSizeUnit: food.servingSizeUnit,
    macros,
  };
}

export async function searchFoods(query: string): Promise<USDASearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  let apiKey: string;
  try {
    apiKey = getApiKey();
  } catch {
    console.warn("USDA search skipped: API key not configured");
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${USDA_BASE_URL}/foods/search?api_key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: trimmed,
        pageSize: MAX_RESULTS,
        pageNumber: 1,
        dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`USDA API returned ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as USDASearchResponse;

    if (!data.foods || !Array.isArray(data.foods)) {
      return [];
    }

    return data.foods.map(mapFoodToResult);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.error("USDA API request timed out");
      return [];
    }
    console.error("USDA API error:", error);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Enhanced search with configurable options (used by foodSearchPipeline)
// ---------------------------------------------------------------------------

export interface USDASearchOptions {
  dataTypes?: string[];
  pageSize?: number;
  timeoutMs?: number;
}

export async function searchFoodsEnhanced(
  query: string,
  options: USDASearchOptions = {},
): Promise<USDASearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  let apiKey: string;
  try {
    apiKey = getApiKey();
  } catch {
    console.warn("USDA search skipped: API key not configured");
    return [];
  }

  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${USDA_BASE_URL}/foods/search?api_key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: trimmed,
        pageSize: options.pageSize ?? MAX_RESULTS,
        pageNumber: 1,
        dataType: options.dataTypes ?? ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`USDA API returned ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as USDASearchResponse;
    if (!data.foods || !Array.isArray(data.foods)) return [];

    return data.foods
      .map(mapFoodToResult)
      .filter((r) => {
        // Filter out junk entries with no meaningful macro data
        const m = r.macros;
        return m.calories > 0 || m.proteinG > 0 || m.carbsG > 0 || m.fatG > 0;
      });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.error(`USDA API request timed out (${timeoutMs}ms)`);
      return [];
    }
    console.error("USDA API error:", error);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Minimal type for GET /food/{id} response (may use "nutrients" instead of "foodNutrients"). */
interface USDASingleFoodResponse {
  fdcId: number;
  description?: string;
  brandOwner?: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: USDAFoodNutrient[];
  nutrients?: Array<{ nutrient?: { id?: number }; amount?: number }>;
}

function normalizeToSearchFood(raw: USDASingleFoodResponse): USDASearchFood {
  const nutrients =
    raw.foodNutrients ??
    (raw.nutrients?.map((n) => ({
      nutrientId: n.nutrient?.id,
      value: n.amount,
      amount: n.amount,
    })) as USDAFoodNutrient[]);
  return {
    fdcId: raw.fdcId,
    description: raw.description ?? "",
    brandOwner: raw.brandOwner,
    brandName: raw.brandName,
    servingSize: raw.servingSize,
    servingSizeUnit: raw.servingSizeUnit,
    foodNutrients: nutrients ?? [],
  };
}

/** Fetch a single food by FDC ID (e.g. for recomputing macros on quantity edit). */
export async function getFoodByFdcId(fdcId: number): Promise<USDASearchResult | null> {
  let apiKey: string;
  try {
    apiKey = getApiKey();
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${USDA_BASE_URL}/food/${fdcId}?api_key=${apiKey}`,
      { signal: controller.signal },
    );
    if (!response.ok) return null;
    const raw = (await response.json()) as USDASingleFoodResponse;
    const food = normalizeToSearchFood(raw);
    return mapFoodToResult(food);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
