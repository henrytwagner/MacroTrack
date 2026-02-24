import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { FOOD_PARSER_SYSTEM_PROMPT } from "../../../shared/prompts/system-prompt.js";
import { buildGeminiUserMessage } from "../../../shared/prompts/build-request.js";
import type {
  GeminiRequestContext,
  GeminiIntent,
  GeminiAddItemsIntent,
  GeminiEditItemIntent,
  GeminiRemoveItemIntent,
  GeminiCreateFoodResponseIntent,
  GeminiSessionEndIntent,
  GeminiClarifyIntent,
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
      } else {
        intent.payload.value = Number(value);
      }
      return intent;
    }

    case "REMOVE_ITEM":
    case "CLARIFY":
    case "SESSION_END":
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
