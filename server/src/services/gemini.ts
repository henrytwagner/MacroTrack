import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { FOOD_PARSER_SYSTEM_PROMPT } from "../../../shared/prompts/system-prompt.js";
import { FOOD_ESTIMATION_SYSTEM_PROMPT } from "../../../shared/prompts/estimation-prompt.js";
import { buildGeminiUserMessage } from "../../../shared/prompts/build-request.js";
import type {
  GeminiRequestContext,
  GeminiIntent,
  GeminiAddItemsIntent,
  GeminiEditItemIntent,
  GeminiRemoveItemIntent,
  GeminiCreateFoodResponseIntent,
  GeminiConfirmFoodCreationIntent,
  GeminiSessionEndIntent,
  GeminiClarifyIntent,
  GeminiOpenBarcodeScannerIntent,
  GeminiDisambiguateChoiceIntent,
  Macros,
  USDASearchResult,
} from "../../../shared/types.js";

const MODEL_NAME = "gemini-2.5-flash";

let model: GenerativeModel | null = null;

function getModel(): GenerativeModel {
  if (model) return model;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    throw new Error(
      "GEMINI_API_KEY is not configured. Set it in server/.env",
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: FOOD_PARSER_SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });
  return model;
}

function isMockEnabled(): boolean {
  return process.env.GEMINI_MOCK === "true";
}

/**
 * Coerce Gemini response values to their expected types.
 * Gemini sometimes returns numbers as strings and booleans as strings
 * despite being told not to.
 */
function coerceIntent(raw: GeminiIntent): GeminiIntent {
  switch (raw.action) {
    case "ADD_ITEMS": {
      const intent = raw as GeminiAddItemsIntent;
      intent.payload.items = intent.payload.items.map((item) => ({
        ...item,
        quantity:
          item.quantity != null ? Number(item.quantity) : undefined,
      }));
      return intent;
    }

    case "EDIT_ITEM": {
      const intent = raw as GeminiEditItemIntent;
      if (
        intent.payload.field === "quantity" &&
        intent.payload.newValue != null
      ) {
        intent.payload.newValue = Number(intent.payload.newValue);
      }
      return intent;
    }

    case "CREATE_FOOD_RESPONSE": {
      const intent = raw as GeminiCreateFoodResponseIntent;
      const { field, value } = intent.payload;

      if (field === "confirm") {
        if (typeof value === "string") {
          intent.payload.value =
            value.toLowerCase() === "true" ||
            value.toLowerCase() === "yes";
        }
      } else if (field === "brand" || field === "barcode") {
        // Keep as string — empty string means skip
        if (typeof value !== "string") {
          intent.payload.value = String(value ?? "");
        }
      } else {
        intent.payload.value = Number(value);
      }
      return intent;
    }

    case "REMOVE_ITEM":
    case "CLARIFY":
    case "SESSION_END":
    case "CANCEL_OPERATION":
    case "UNDO":
    case "REDO":
    case "DISAMBIGUATE_CHOICE":
    case "CREATE_FOOD_DIRECTLY":
    case "CLEAR_ALL":
    case "QUERY_HISTORY":
    case "QUERY_REMAINING":
    case "LOOKUP_FOOD_INFO":
    case "SUGGEST_FOODS":
    case "ESTIMATE_FOOD":
    case "CONFIRM_FOOD_CREATION":
      return raw;

    default:
      return raw;
  }
}

// ---------------------------------------------------------------------------
// Real Gemini API implementation
// ---------------------------------------------------------------------------

async function parseTranscriptReal(
  context: GeminiRequestContext,
): Promise<GeminiIntent> {
  const gemini = getModel();
  const userMessage = buildGeminiUserMessage(context);

  const result = await gemini.generateContent(userMessage);
  const text = result.response.text();

  const parsed = JSON.parse(text) as GeminiIntent;
  return coerceIntent(parsed);
}

// ---------------------------------------------------------------------------
// Mock implementation — deterministic, no API calls
// ---------------------------------------------------------------------------

function parseTranscriptMock(
  context: GeminiRequestContext,
): GeminiIntent {
  const t = context.transcript.toLowerCase().trim();

  // Session end
  if (/\b(done|save that|that's it|i'm finished|save|all done|that's everything)\b/.test(t)) {
    return { action: "SESSION_END", payload: null } satisfies GeminiSessionEndIntent;
  }

  // Confirming food creation
  if (context.sessionState.startsWith("confirming:")) {
    if (/cancel|never mind|nevermind|forget it/i.test(t)) {
      return { action: "CANCEL_OPERATION", payload: null };
    }
    const saveMode = (t.includes("community") || t.includes("share")) ? "community" : "private";
    // Parse optional "N unit" from speech: "save privately 2 cups"
    const qtyMatch = t.match(/(\d+(?:\.\d+)?)\s+(\w+)/);
    const quantity = qtyMatch ? Number(qtyMatch[1]) : undefined;
    const unit = qtyMatch ? normalizeUnit(qtyMatch[2]) : undefined;
    return {
      action: "CONFIRM_FOOD_CREATION",
      payload: { saveMode, quantity, unit },
    } satisfies GeminiConfirmFoodCreationIntent;
  }

  // Disambiguation choice
  if (context.sessionState.startsWith("disambiguating:")) {
    const numMatch = t.match(/\b([123]|one|two|three|first|second|third)\b/);
    if (numMatch) {
      const wordToNum: Record<string, number> = { one: 1, first: 1, two: 2, second: 2, three: 3, third: 3 };
      const choice = wordToNum[numMatch[1]] ?? Number(numMatch[1]);
      return {
        action: "DISAMBIGUATE_CHOICE",
        payload: { targetItem: "", choice },
      } satisfies GeminiDisambiguateChoiceIntent;
    }
    // Keyword choice
    return {
      action: "DISAMBIGUATE_CHOICE",
      payload: { targetItem: "", choice: t },
    } satisfies GeminiDisambiguateChoiceIntent;
  }

  // Clear all
  if (/\b(clear all|clear everything|start over|delete all|remove everything)\b/.test(t)) {
    return { action: "CLEAR_ALL", payload: null };
  }

  // Query remaining macros
  if (/\b(how much left|remaining|what's left|calories left|macros left)\b/.test(t)) {
    return { action: "QUERY_REMAINING", payload: null };
  }

  // Suggest foods
  if (/\b(suggest|what should i eat|what fits|recommendations|what can i have)\b/.test(t)) {
    return { action: "SUGGEST_FOODS", payload: null };
  }

  // Query history
  const historyMatch = t.match(/(?:what did i (?:eat|have)|show me)\s+(.+?)(?:\s*(?:'s|for)\s+(\w+))?$/);
  if (historyMatch) {
    return {
      action: "QUERY_HISTORY",
      payload: { datePhrase: historyMatch[1].trim(), mealLabel: undefined, addToDraft: t.includes("add") || t.includes("log same") },
    };
  }

  // Lookup food info
  const foodInfoMatch = t.match(/(?:how (?:many|much)|what(?:'s| is) the|nutrition (?:for|in))\s+(?:calories|protein|carbs|fat|macros)?\s*(?:in|for)?\s*(.+)/);
  if (foodInfoMatch) {
    return { action: "LOOKUP_FOOD_INFO", payload: { query: foodInfoMatch[1].trim() } };
  }

  // Estimate food
  if (/\b(estimate|guess|approximate)\b/.test(t)) {
    const name = t.replace(/\b(estimate|guess|approximate)\s+(the macros for|macros for)?\s*/i, "").trim();
    if (name.length > 0) {
      return { action: "ESTIMATE_FOOD", payload: { name } };
    }
  }

  // Create food directly
  const createMatch = t.match(/^(?:create|add custom|new food)\s+(.+)/);
  if (createMatch) {
    return { action: "CREATE_FOOD_DIRECTLY", payload: { name: createMatch[1].trim() } };
  }

  // Barcode scanner
  if (/\b(scan|barcode|scan a barcode|scan the product|scan this)\b/.test(t)) {
    return { action: "OPEN_BARCODE_SCANNER", payload: null } satisfies GeminiOpenBarcodeScannerIntent;
  }

  // Cancel operation (check before creating flow so it can escape)
  if (/^(nevermind|never mind|cancel that|forget it|go back|stop)$/.test(t)) {
    return { action: "CANCEL_OPERATION", payload: null };
  }

  // Undo / redo
  if (/^(undo|undo that)$/.test(t)) {
    return { action: "UNDO", payload: null };
  }
  if (/^(redo|redo that)$/.test(t)) {
    return { action: "REDO", payload: null };
  }

  // Creating food flow — respond to creation questions
  if (context.sessionState.startsWith("creating:") && context.creatingFoodProgress) {
    const field = context.creatingFoodProgress.currentField;
    return mockCreateFoodResponse(t, field);
  }

  // Remove
  const removeMatch = t.match(
    /(?:remove|take off|never mind|delete)\s+(?:the\s+)?(.+)/,
  );
  if (removeMatch) {
    return {
      action: "REMOVE_ITEM",
      payload: { targetItem: removeMatch[1].trim() },
    } satisfies GeminiRemoveItemIntent;
  }

  // Edit — explicit name
  const editNameMatch = t.match(
    /(?:change|update)\s+(?:the\s+)?(.+?)\s+to\s+(\d+)\s*(\w+)?/,
  );
  if (editNameMatch) {
    return {
      action: "EDIT_ITEM",
      payload: {
        targetItem: editNameMatch[1].trim(),
        field: "quantity",
        newValue: Number(editNameMatch[2]),
      },
    } satisfies GeminiEditItemIntent;
  }

  // Edit — implicit "make that N"
  const makeMatch = t.match(/(?:actually\s+)?make\s+that\s+(\d+)/);
  if (makeMatch && context.currentDraft.length > 0) {
    const last = context.currentDraft[context.currentDraft.length - 1];
    return {
      action: "EDIT_ITEM",
      payload: {
        targetItem: last.name,
        field: "quantity",
        newValue: Number(makeMatch[1]),
      },
    } satisfies GeminiEditItemIntent;
  }

  // Edit — "not X, Y" correction
  const notMatch = t.match(/not\s+(\d+)\s*(?:grams|g)?\s*,?\s*(\d+)/);
  if (notMatch && context.currentDraft.length > 0) {
    const oldVal = Number(notMatch[1]);
    const matched = context.currentDraft.find((d) => d.quantity === oldVal);
    const target = matched ?? context.currentDraft[context.currentDraft.length - 1];
    return {
      action: "EDIT_ITEM",
      payload: {
        targetItem: target.name,
        field: "quantity",
        newValue: Number(notMatch[2]),
      },
    } satisfies GeminiEditItemIntent;
  }

  // Add items — parse "N unit of food" patterns
  const items = mockParseAddItems(t);
  if (items.length > 0) {
    return {
      action: "ADD_ITEMS",
      payload: { items },
    } satisfies GeminiAddItemsIntent;
  }

  // Clarify for countable items with no quantity
  const countables = ["eggs", "egg", "slices", "pieces", "apples", "bananas"];
  const words = t.replace(/^(?:add|log)\s+/, "").trim();
  if (countables.some((c) => words === c || words.endsWith(` ${c}`))) {
    return {
      action: "CLARIFY",
      payload: {
        targetItem: words,
        question: `How many ${words}?`,
      },
    } satisfies GeminiClarifyIntent;
  }

  // Fallback: treat as a single food item with no quantity
  if (t.length > 0 && !/^(?:uhh?|hmm+|the thing|um+)$/i.test(t)) {
    const name = t.replace(/^(?:add|log|i had|i ate)\s+/i, "").trim();
    if (name.length > 0) {
      return {
        action: "ADD_ITEMS",
        payload: { items: [{ name, quantity: undefined, unit: undefined }] },
      } satisfies GeminiAddItemsIntent;
    }
  }

  // Unrecognizable
  return { action: "ADD_ITEMS", payload: { items: [] } } satisfies GeminiAddItemsIntent;
}

function mockCreateFoodResponse(
  transcript: string,
  currentField: string,
): GeminiCreateFoodResponseIntent {
  const t = transcript.toLowerCase().trim();

  if (currentField === "confirm") {
    const yes = /\b(yes|yeah|sure|go ahead|yep|ok|okay)\b/.test(t);
    return {
      action: "CREATE_FOOD_RESPONSE",
      payload: { field: "confirm", value: yes },
    };
  }

  if (currentField === "servingSize") {
    const match = t.match(/(\d+)\s*(\w+)/);
    return {
      action: "CREATE_FOOD_RESPONSE",
      payload: {
        field: "servingSize",
        value: match ? Number(match[1]) : 1,
        unit: match ? normalizeUnit(match[2]) : "servings",
      },
    };
  }

  // Brand/barcode — string fields, support "skip"
  if (currentField === "brand" || currentField === "barcode") {
    const isSkip = /\b(skip|no|none|no brand|no barcode|n\/a)\b/.test(t);
    return {
      action: "CREATE_FOOD_RESPONSE",
      payload: {
        field: currentField,
        value: isSkip ? "" : t,
      },
    };
  }

  // Numeric fields: calories, protein, carbs, fat
  const num = t.match(/(\d+)/);
  return {
    action: "CREATE_FOOD_RESPONSE",
    payload: {
      field: currentField as "calories" | "protein" | "carbs" | "fat",
      value: num ? Number(num[1]) : 0,
    },
  };
}

function mockParseAddItems(
  transcript: string,
): Array<{ name: string; quantity?: number; unit?: string }> {
  const items: Array<{ name: string; quantity?: number; unit?: string }> = [];

  // Split on "and" / commas for multi-item parsing
  const segments = transcript
    .replace(/^(?:add|log|i had|i ate)\s+/i, "")
    .split(/\s*(?:,\s*(?:and\s+)?|(?:\s+and\s+))\s*/);

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;

    // "N unit of food" — e.g. "200 grams of chicken breast"
    const withOf = trimmed.match(/^(\d+(?:\.\d+)?)\s+(\w+)\s+of\s+(.+)/i);
    if (withOf) {
      items.push({
        name: withOf[3].trim(),
        quantity: Number(withOf[1]),
        unit: normalizeUnit(withOf[2]),
      });
      continue;
    }

    // "a/an unit of food" — e.g. "a cup of rice"
    const aUnitOf = trimmed.match(/^an?\s+(\w+)\s+of\s+(.+)/i);
    if (aUnitOf) {
      items.push({
        name: aUnitOf[2].trim(),
        quantity: 1,
        unit: normalizeUnit(aUnitOf[1]),
      });
      continue;
    }

    // "N food" — e.g. "2 eggs"
    const nFood = trimmed.match(/^(\d+(?:\.\d+)?)\s+(.+)/);
    if (nFood) {
      items.push({
        name: nFood[2].trim(),
        quantity: Number(nFood[1]),
        unit: "pieces",
      });
      continue;
    }

    // "a/an food" — e.g. "a banana"
    const aFood = trimmed.match(/^an?\s+(.+)/i);
    if (aFood) {
      items.push({
        name: aFood[1].trim(),
        quantity: 1,
        unit: "pieces",
      });
      continue;
    }
  }

  return items;
}

function normalizeUnit(raw: string): string {
  const u = raw.toLowerCase().trim();
  const map: Record<string, string> = {
    gram: "g",
    grams: "g",
    g: "g",
    ounce: "oz",
    ounces: "oz",
    oz: "oz",
    cup: "cups",
    cups: "cups",
    serving: "servings",
    servings: "servings",
    slice: "slices",
    slices: "slices",
    piece: "pieces",
    pieces: "pieces",
    tablespoon: "tbsp",
    tablespoons: "tbsp",
    tbsp: "tbsp",
    teaspoon: "tsp",
    teaspoons: "tsp",
    tsp: "tsp",
    ml: "ml",
    milliliter: "ml",
    milliliters: "ml",
    liter: "ml",
  };
  return map[u] ?? u;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseTranscript(
  context: GeminiRequestContext,
): Promise<GeminiIntent> {
  if (isMockEnabled()) {
    console.log("[Gemini MOCK] Parsing transcript:", context.transcript);
    const intent = parseTranscriptMock(context);
    console.log("[Gemini MOCK] Returned intent:", JSON.stringify(intent));
    return intent;
  }

  return parseTranscriptReal(context);
}

// ---------------------------------------------------------------------------
// Food estimation (Phase 6 — bounded AI estimates)
// ---------------------------------------------------------------------------

export async function estimateFood(
  name: string,
  qty?: number,
  unit?: string,
  context?: string,
): Promise<{
  estimatable: boolean;
  name: string;
  servingSize: number;
  servingUnit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: "high" | "medium" | "low";
}> {
  if (isMockEnabled()) {
    // Mock: always return a simple estimate for testing
    return {
      estimatable: true,
      name,
      servingSize: qty ?? 1,
      servingUnit: unit ?? "medium",
      calories: 89,
      proteinG: 1.1,
      carbsG: 23,
      fatG: 0.3,
      confidence: "high",
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const estimationModel = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: FOOD_ESTIMATION_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  });

  const prompt = context
    ? `Estimate: ${qty ?? 1} ${unit ?? "serving"} of ${name} (context: ${context})`
    : `Estimate: ${qty ?? 1} ${unit ?? "serving"} of ${name}`;

  const result = await estimationModel.generateContent(prompt);
  return JSON.parse(result.response.text()) as Awaited<ReturnType<typeof estimateFood>>;
}

// ---------------------------------------------------------------------------
// Food suggestions (Phase 5 — grounded AI suggestions)
// ---------------------------------------------------------------------------

export async function suggestFoodsFromCandidates(
  remaining: Macros,
  candidates: USDASearchResult[],
): Promise<Array<{ name: string; macros: Macros; reason: string }>> {
  if (isMockEnabled()) {
    return candidates.slice(0, 3).map((c) => ({
      name: c.description,
      macros: c.macros,
      reason: `Fits your remaining ${remaining.proteinG.toFixed(0)}g protein target.`,
    }));
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const suggestionModel = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
  });

  const prompt = `You are a nutrition assistant. Given the user's remaining daily macros and a list of food candidates, suggest the top 3 foods that best fit the remaining goals.

Remaining macros: ${JSON.stringify(remaining)}

Candidates (USDA foods):
${candidates.slice(0, 10).map((c, i) => `${i + 1}. ${c.description} — cal: ${c.macros.calories}, P: ${c.macros.proteinG}g, C: ${c.macros.carbsG}g, F: ${c.macros.fatG}g`).join("\n")}

Return ONLY valid JSON array: [{ "name": string, "macros": { "calories": number, "proteinG": number, "carbsG": number, "fatG": number }, "reason": string }]
Pick from the candidates list only. Keep reasons short (< 15 words).`;

  const result = await suggestionModel.generateContent(prompt);
  return JSON.parse(result.response.text()) as Array<{ name: string; macros: Macros; reason: string }>;
}
