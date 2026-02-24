import { prisma } from "../db/client.js";
import { parseTranscript } from "./gemini.js";
import { searchFoods } from "./usda.js";
import type {
  GeminiRequestContext,
  GeminiIntent,
  GeminiAddItemsIntent,
  GeminiEditItemIntent,
  GeminiRemoveItemIntent,
  GeminiClarifyIntent,
  GeminiCreateFoodResponseIntent,
  WSServerMessage,
  WSItemsAddedMessage,
  WSItemEditedMessage,
  WSItemRemovedMessage,
  WSClarifyMessage,
  WSCreateFoodPromptMessage,
  WSErrorMessage,
  DraftItem,
  MealLabel,
  FoodSource,
} from "../../../shared/types.js";

let tmpIdCounter = 0;

function nextTmpId(): string {
  tmpIdCounter += 1;
  return `tmp-${tmpIdCounter}`;
}

export function resetTmpIdCounter(): void {
  tmpIdCounter = 0;
}

// ---------------------------------------------------------------------------
// Meal label assignment based on time of day
// ---------------------------------------------------------------------------

function getMealLabel(timeOfDay: string): MealLabel {
  const [h] = timeOfDay.split(":").map(Number);
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 14) return "lunch";
  if (h >= 14 && h < 17) return "snack";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

// ---------------------------------------------------------------------------
// Custom food fuzzy matching
// ---------------------------------------------------------------------------

async function findCustomFood(
  name: string,
  userId: string,
): Promise<{
  id: string;
  name: string;
  servingSize: number;
  servingUnit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
} | null> {
  const normalized = name.toLowerCase().trim();

  const customFoods = await prisma.customFood.findMany({
    where: { userId },
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
  });

  // Exact match first
  const exact = customFoods.find(
    (f) => f.name.toLowerCase() === normalized,
  );
  if (exact) return exact;

  // Contains match (fuzzy)
  const contains = customFoods.find(
    (f) =>
      f.name.toLowerCase().includes(normalized) ||
      normalized.includes(f.name.toLowerCase()),
  );
  return contains ?? null;
}

// ---------------------------------------------------------------------------
// Scale macros based on quantity relative to serving size
// ---------------------------------------------------------------------------

function scaleMacros(
  baseMacros: { calories: number; proteinG: number; carbsG: number; fatG: number },
  baseServingSize: number,
  requestedQuantity: number,
): { calories: number; proteinG: number; carbsG: number; fatG: number } {
  if (baseServingSize <= 0) return baseMacros;
  const ratio = requestedQuantity / baseServingSize;
  return {
    calories: Math.round(baseMacros.calories * ratio),
    proteinG: Math.round(baseMacros.proteinG * ratio * 10) / 10,
    carbsG: Math.round(baseMacros.carbsG * ratio * 10) / 10,
    fatG: Math.round(baseMacros.fatG * ratio * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Lookup a single food item: custom foods → USDA → no match
// ---------------------------------------------------------------------------

async function lookupItem(
  item: { name: string; quantity?: number; unit?: string },
  userId: string,
  mealLabel: MealLabel,
): Promise<{ found: true; draft: DraftItem } | { found: false; name: string; tmpId: string }> {
  const tmpId = nextTmpId();
  const quantity = item.quantity ?? 1;
  const unit = item.unit ?? "servings";

  // 1. Check custom foods
  const custom = await findCustomFood(item.name, userId);
  if (custom) {
    const macros = scaleMacros(
      custom,
      custom.servingSize,
      quantity,
    );
    return {
      found: true,
      draft: {
        id: tmpId,
        name: custom.name,
        quantity,
        unit,
        ...macros,
        source: "CUSTOM" as FoodSource,
        customFoodId: custom.id,
        mealLabel,
        state: "normal",
      },
    };
  }

  // 2. Search USDA
  const usdaResults = await searchFoods(item.name);
  if (usdaResults.length > 0) {
    const best = usdaResults[0]; // Auto-pick the most generic/common match
    const servingSize = best.servingSize ?? 100;

    const macros = scaleMacros(
      best.macros,
      servingSize,
      quantity,
    );
    return {
      found: true,
      draft: {
        id: tmpId,
        name: best.description,
        quantity,
        unit: unit === "servings" ? (best.servingSizeUnit ?? "g") : unit,
        ...macros,
        source: "DATABASE" as FoodSource,
        usdaFdcId: best.fdcId,
        mealLabel,
        state: "normal",
      },
    };
  }

  // 3. No match
  return { found: false, name: item.name, tmpId };
}

// ---------------------------------------------------------------------------
// Process each intent type
// ---------------------------------------------------------------------------

async function handleAddItems(
  intent: GeminiAddItemsIntent,
  context: GeminiRequestContext,
  userId: string,
): Promise<WSServerMessage[]> {
  const messages: WSServerMessage[] = [];

  if (intent.payload.items.length === 0) {
    messages.push({
      type: "error",
      message: "I didn't catch that, could you say it again?",
    } satisfies WSErrorMessage);
    return messages;
  }

  const mealLabel = getMealLabel(context.timeOfDay);

  const foundItems: DraftItem[] = [];
  for (const item of intent.payload.items) {
    const result = await lookupItem(item, userId, mealLabel);
    if (result.found) {
      foundItems.push(result.draft);
    } else {
      // No match — prompt to create custom food
      if (foundItems.length > 0) {
        messages.push({
          type: "items_added",
          items: foundItems.splice(0),
        } satisfies WSItemsAddedMessage);
      }
      messages.push({
        type: "create_food_prompt",
        itemId: result.tmpId,
        foodName: result.name,
        question: `I couldn't find '${result.name}'. Would you like to create it?`,
      } satisfies WSCreateFoodPromptMessage);
    }
  }

  if (foundItems.length > 0) {
    messages.push({
      type: "items_added",
      items: foundItems,
    } satisfies WSItemsAddedMessage);
  }

  return messages;
}

function handleEditItem(
  intent: GeminiEditItemIntent,
  context: GeminiRequestContext,
): WSServerMessage {
  const { targetItem, field, newValue } = intent.payload;

  // Find the matching draft item by name (case-insensitive fuzzy)
  const target = context.currentDraft.find(
    (d) =>
      d.name.toLowerCase() === targetItem.toLowerCase() ||
      d.name.toLowerCase().includes(targetItem.toLowerCase()) ||
      targetItem.toLowerCase().includes(d.name.toLowerCase()),
  );

  if (!target) {
    return {
      type: "error",
      message: `I couldn't find "${targetItem}" in your current items.`,
    } satisfies WSErrorMessage;
  }

  const changes: Record<string, unknown> = {};
  changes[field] = typeof newValue === "string" ? newValue : Number(newValue);

  return {
    type: "item_edited",
    itemId: target.id,
    changes,
  } satisfies WSItemEditedMessage;
}

function handleRemoveItem(
  intent: GeminiRemoveItemIntent,
  context: GeminiRequestContext,
): WSServerMessage {
  const { targetItem } = intent.payload;

  const target = context.currentDraft.find(
    (d) =>
      d.name.toLowerCase() === targetItem.toLowerCase() ||
      d.name.toLowerCase().includes(targetItem.toLowerCase()) ||
      targetItem.toLowerCase().includes(d.name.toLowerCase()),
  );

  if (!target) {
    return {
      type: "error",
      message: `I couldn't find "${targetItem}" to remove.`,
    } satisfies WSErrorMessage;
  }

  return {
    type: "item_removed",
    itemId: target.id,
  } satisfies WSItemRemovedMessage;
}

function handleClarify(intent: GeminiClarifyIntent): WSServerMessage {
  return {
    type: "clarify",
    itemId: nextTmpId(),
    question: intent.payload.question,
  } satisfies WSClarifyMessage;
}

// ---------------------------------------------------------------------------
// Main orchestrator entry point
// ---------------------------------------------------------------------------

export async function processTranscript(
  context: GeminiRequestContext,
  userId: string,
): Promise<WSServerMessage[]> {
  let intent: GeminiIntent;

  try {
    intent = await parseTranscript(context);
  } catch (error) {
    console.error("Gemini parsing failed:", error);
    return [
      {
        type: "error",
        message:
          "I'm having trouble processing that. You can try again or add items manually.",
      } satisfies WSErrorMessage,
    ];
  }

  switch (intent.action) {
    case "ADD_ITEMS":
      return handleAddItems(intent, context, userId);

    case "EDIT_ITEM":
      return [handleEditItem(intent, context)];

    case "REMOVE_ITEM":
      return [handleRemoveItem(intent, context)];

    case "CLARIFY":
      return [handleClarify(intent)];

    case "CREATE_FOOD_RESPONSE":
      // CREATE_FOOD_RESPONSE is handled by the WebSocket session handler
      // since it needs access to the session's creation state machine.
      // We pass it through so the caller can act on it.
      return [
        {
          type: "create_food_field",
          itemId: context.sessionState.replace("creating:", ""),
          foodName: "",
          field: (intent as GeminiCreateFoodResponseIntent).payload.field,
          question: "",
        },
      ];

    case "SESSION_END":
      return [{ type: "session_saved", entriesCount: 0 }];

    default:
      return [
        {
          type: "error",
          message: "I didn't catch that, could you say it again?",
        } satisfies WSErrorMessage,
      ];
  }
}
