import { prisma } from "../db/client.js";
import { parseTranscript } from "./gemini.js";
import { searchFoods, getFoodByFdcId } from "./usda.js";
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
  WSFoodChoiceMessage,
  WSErrorMessage,
  WSDisambiguateMessage,
  DraftItem,
  MealLabel,
  FoodSource,
  USDASearchResult,
  DisambiguationOption,
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
// Community food fuzzy matching
// ---------------------------------------------------------------------------

async function findCommunityFood(
  name: string,
): Promise<{
  id: string;
  name: string;
  brandName: string | null;
  defaultServingSize: number;
  defaultServingUnit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
} | null> {
  const normalized = name.toLowerCase().trim();

  const result = await prisma.communityFood.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { name: { contains: normalized, mode: "insensitive" } },
        { brandName: { contains: normalized, mode: "insensitive" } },
      ],
    },
    orderBy: [{ trustScore: "desc" }, { usesCount: "desc" }],
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
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// User history lookup (Tier 1/2 for Phase 2 disambiguation)
// ---------------------------------------------------------------------------

async function lookupUserHistory(
  name: string,
  userId: string,
): Promise<{
  quantity: number;
  unit: string;
  logCount: number;
  usdaFdcId?: number;
  customFoodId?: string;
  communityFoodId?: string;
  source: FoodSource;
  macros: { calories: number; proteinG: number; carbsG: number; fatG: number };
} | null> {
  const normalized = name.toLowerCase().trim();

  const entries = await prisma.foodEntry.findMany({
    where: {
      userId,
      OR: [
        { name: { contains: normalized, mode: "insensitive" } },
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

  if (entries.length === 0) return null;

  // Group by food identity key
  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = entry.usdaFdcId
      ? `usda:${entry.usdaFdcId}`
      : entry.customFoodId
        ? `custom:${entry.customFoodId}`
        : `name:${entry.name.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }

  // Pick the group with the highest count
  let bestGroup: typeof entries = [];
  for (const group of groups.values()) {
    if (group.length > bestGroup.length) bestGroup = group;
  }

  const mostRecent = bestGroup[0];
  return {
    quantity: mostRecent.quantity,
    unit: mostRecent.unit,
    logCount: bestGroup.length,
    usdaFdcId: mostRecent.usdaFdcId ?? undefined,
    customFoodId: mostRecent.customFoodId ?? undefined,
    communityFoodId: mostRecent.communityFoodId ?? undefined,
    source: mostRecent.source as FoodSource,
    macros: {
      calories: mostRecent.calories,
      proteinG: mostRecent.proteinG,
      carbsG: mostRecent.carbsG,
      fatG: mostRecent.fatG,
    },
  };
}

// ---------------------------------------------------------------------------
// Disambiguation threshold check
// ---------------------------------------------------------------------------

export function shouldDisambiguate(query: string, results: USDASearchResult[]): boolean {
  if (results.length < 2) return false;
  const top = results[0];
  const last = results[Math.min(results.length - 1, 2)];
  const topCal = top.macros.calories;
  const lastCal = last.macros.calories;
  const maxCal = Math.max(topCal, lastCal);
  if (maxCal === 0) return false;
  const diff = Math.abs(topCal - lastCal) / maxCal;
  // Suppress unused variable warning
  void query;
  return diff > 0.15;
}

// ---------------------------------------------------------------------------
// Scale macros based on quantity relative to serving size
// When unit is "servings", quantity is number of servings → ratio = quantity.
// When unit matches base (e.g. "g"), quantity is in base units → ratio = quantity / baseServingSize.
// ---------------------------------------------------------------------------

function scaleMacros(
  baseMacros: { calories: number; proteinG: number; carbsG: number; fatG: number },
  baseServingSize: number,
  requestedQuantity: number,
  requestedUnit?: string,
): { calories: number; proteinG: number; carbsG: number; fatG: number } {
  const isServings =
    !requestedUnit ||
    requestedUnit.toLowerCase() === "servings" ||
    requestedUnit.toLowerCase() === "serving";
  const ratio = isServings
    ? requestedQuantity
    : baseServingSize <= 0
      ? 1
      : requestedQuantity / baseServingSize;
  return {
    calories: Math.round(baseMacros.calories * ratio),
    proteinG: Math.round(baseMacros.proteinG * ratio * 10) / 10,
    carbsG: Math.round(baseMacros.carbsG * ratio * 10) / 10,
    fatG: Math.round(baseMacros.fatG * ratio * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Lookup a single food item: history → custom → community → USDA → no match
// ---------------------------------------------------------------------------

async function lookupItem(
  item: { name: string; quantity?: number; unit?: string },
  userId: string,
  mealLabel: MealLabel,
): Promise<{ found: true; draft: DraftItem } | { found: false; name: string; tmpId: string }> {
  const tmpId = nextTmpId();
  const userSpecifiedQty = item.quantity != null;
  const quantity = item.quantity ?? 1;
  const unit = item.unit ?? "servings";

  // Tier 1/2: Check user history (custom or USDA foods previously logged)
  const history = await lookupUserHistory(item.name, userId);
  if (history && history.logCount >= 1) {
    const histQty = userSpecifiedQty ? quantity : history.quantity;
    const histUnit = userSpecifiedQty ? unit : history.unit;
    const isAssumed = !userSpecifiedQty;

    // If history points to a USDA food, reconstruct from USDA
    if (history.source === "DATABASE" && history.usdaFdcId) {
      const usdaResult = await getFoodByFdcId(history.usdaFdcId);
      if (usdaResult) {
        const servingSize = usdaResult.servingSize ?? 100;
        const macros = scaleMacros(usdaResult.macros, servingSize, histQty, histUnit);
        return {
          found: true,
          draft: {
            id: tmpId,
            name: usdaResult.description,
            quantity: histQty,
            unit: histUnit === "servings" ? (usdaResult.servingSizeUnit ?? "g") : histUnit,
            ...macros,
            source: "DATABASE" as FoodSource,
            usdaFdcId: history.usdaFdcId,
            mealLabel,
            state: "normal",
            isAssumed,
          },
        };
      }
    }

    // If history points to a custom food
    if (history.source === "CUSTOM" && history.customFoodId) {
      const custom = await prisma.customFood.findUnique({
        where: { id: history.customFoodId, userId },
        select: { id: true, name: true, servingSize: true, servingUnit: true, calories: true, proteinG: true, carbsG: true, fatG: true },
      });
      if (custom) {
        const macros = scaleMacros(custom, custom.servingSize, histQty, histUnit);
        return {
          found: true,
          draft: {
            id: tmpId,
            name: custom.name,
            quantity: histQty,
            unit: histUnit,
            ...macros,
            source: "CUSTOM" as FoodSource,
            customFoodId: custom.id,
            mealLabel,
            state: "normal",
            isAssumed,
          },
        };
      }
    }

    // Community food from history
    if (history.source === "COMMUNITY" && history.communityFoodId) {
      const community = await prisma.communityFood.findUnique({
        where: { id: history.communityFoodId },
        select: { id: true, name: true, brandName: true, defaultServingSize: true, defaultServingUnit: true, calories: true, proteinG: true, carbsG: true, fatG: true },
      });
      if (community) {
        const macros = scaleMacros(community, community.defaultServingSize, histQty, histUnit);
        const displayName = community.brandName ? `${community.brandName} — ${community.name}` : community.name;
        return {
          found: true,
          draft: {
            id: tmpId,
            name: displayName,
            quantity: histQty,
            unit: histUnit === "servings" ? community.defaultServingUnit : histUnit,
            ...macros,
            source: "COMMUNITY" as FoodSource,
            communityFoodId: community.id,
            mealLabel,
            state: "normal",
            isAssumed,
          },
        };
      }
    }
  }

  // Tier 2: Check custom foods (name match)
  const custom = await findCustomFood(item.name, userId);
  if (custom) {
    const macros = scaleMacros(custom, custom.servingSize, quantity, unit);
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

  // Tier 2b: Check community foods
  const community = await findCommunityFood(item.name);
  if (community) {
    const macros = scaleMacros(community, community.defaultServingSize, quantity, unit);
    // Fire-and-forget: increment usage stats
    prisma.communityFood.update({
      where: { id: community.id },
      data: { usesCount: { increment: 1 }, lastUsedAt: new Date() },
    }).catch(() => {});
    const displayName = community.brandName
      ? `${community.brandName} — ${community.name}`
      : community.name;
    return {
      found: true,
      draft: {
        id: tmpId,
        name: displayName,
        quantity,
        unit: unit === "servings" ? community.defaultServingUnit : unit,
        ...macros,
        source: "COMMUNITY" as FoodSource,
        communityFoodId: community.id,
        mealLabel,
        state: "normal",
      },
    };
  }

  // No match in custom or community — offer food_choice (USDA is opt-in via "try USDA")
  return { found: false, name: item.name, tmpId };
}

// ---------------------------------------------------------------------------
// Explicit food info lookup (no draft add — for LOOKUP_FOOD_INFO intent)
// ---------------------------------------------------------------------------

export async function lookupFoodInfoOnly(
  name: string,
): Promise<{ found: false } | { found: true; usdaResult: USDASearchResult }> {
  const usdaResults = await searchFoods(name);
  if (usdaResults.length === 0) return { found: false };
  return { found: true, usdaResult: usdaResults[0] };
}

// ---------------------------------------------------------------------------
// Explicit USDA lookup (opt-in only — not called automatically)
// ---------------------------------------------------------------------------

export async function lookupItemInUsda(
  name: string,
  quantity?: number,
  unit?: string,
  mealLabel?: MealLabel,
): Promise<{ found: false } | { found: true; draft: DraftItem; usdaResult: USDASearchResult }> {
  const tmpId = nextTmpId();
  const qty = quantity ?? 1;
  const u = unit ?? "servings";
  const meal = mealLabel ?? "snack";

  const usdaResults = await searchFoods(name);
  if (usdaResults.length === 0) return { found: false };

  const best = usdaResults[0];
  const servingSize = best.servingSize ?? 100;
  const macros = scaleMacros(best.macros, servingSize, qty, u);

  return {
    found: true,
    usdaResult: best,
    draft: {
      id: tmpId,
      name: best.description,
      quantity: qty,
      unit: u === "servings" ? (best.servingSizeUnit ?? "g") : u,
      ...macros,
      source: "DATABASE" as FoodSource,
      usdaFdcId: best.fdcId,
      mealLabel: meal,
      state: "normal",
    },
  };
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
  const assumedItems: DraftItem[] = [];

  for (const item of intent.payload.items) {
    const result = await lookupItem(item, userId, mealLabel);

    if (result.found === true) {
      foundItems.push(result.draft);
      if (result.draft.isAssumed) {
        assumedItems.push(result.draft);
      }
    } else {
      // No match in custom/community — offer choice: create custom food or try USDA
      if (foundItems.length > 0) {
        messages.push({
          type: "items_added",
          items: foundItems.splice(0),
        } satisfies WSItemsAddedMessage);
      }
      messages.push({
        type: "food_choice",
        itemId: result.tmpId,
        foodName: result.name,
        question: `I couldn't find '${result.name}'. Say 'create it' to add it manually, or 'try USDA' to search the database.`,
      } satisfies WSFoodChoiceMessage);
    }
  }

  if (foundItems.length > 0) {
    messages.push({
      type: "items_added",
      items: foundItems,
    } satisfies WSItemsAddedMessage);
  }

  // Follow-up ask for assumed quantities
  for (const assumed of assumedItems) {
    messages.push({
      type: "ask",
      question: `Added ${assumed.name} — I used ${assumed.quantity} ${assumed.unit} based on your history. Say 'make that N' to adjust.`,
    } satisfies import("../../../shared/types.js").WSAskMessage);
  }

  return messages;
}

/** Fetch base macros and serving for an item so we can recompute totals when quantity/unit changes. */
async function getBaseFoodForEdit(
  source: FoodSource | undefined,
  customFoodId: string | undefined,
  usdaFdcId: number | undefined,
  communityFoodId: string | undefined,
  userId: string,
): Promise<{
  baseMacros: { calories: number; proteinG: number; carbsG: number; fatG: number };
  baseServingSize: number;
  baseServingUnit: string;
} | null> {
  if (source === "CUSTOM" && customFoodId) {
    const row = await prisma.customFood.findUnique({
      where: { id: customFoodId, userId },
      select: {
        servingSize: true,
        servingUnit: true,
        calories: true,
        proteinG: true,
        carbsG: true,
        fatG: true,
      },
    });
    if (!row) return null;
    return {
      baseMacros: row,
      baseServingSize: row.servingSize,
      baseServingUnit: row.servingUnit,
    };
  }
  if (source === "COMMUNITY" && communityFoodId) {
    const row = await prisma.communityFood.findUnique({
      where: { id: communityFoodId },
      select: {
        defaultServingSize: true,
        defaultServingUnit: true,
        calories: true,
        proteinG: true,
        carbsG: true,
        fatG: true,
      },
    });
    if (!row) return null;
    return {
      baseMacros: row,
      baseServingSize: row.defaultServingSize,
      baseServingUnit: row.defaultServingUnit,
    };
  }
  if (source === "DATABASE" && usdaFdcId) {
    const result = await getFoodByFdcId(usdaFdcId);
    if (!result) return null;
    return {
      baseMacros: result.macros,
      baseServingSize: result.servingSize ?? 100,
      baseServingUnit: result.servingSizeUnit ?? "g",
    };
  }
  return null;
}

async function handleEditItem(
  intent: GeminiEditItemIntent,
  context: GeminiRequestContext,
  userId: string,
): Promise<WSServerMessage> {
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

  const newQuantity = field === "quantity" ? Number(newValue) : target.quantity;
  const newUnit = field === "unit" ? String(newValue) : target.unit;
  const quantityOrUnitChanged =
    (field === "quantity" && newQuantity !== target.quantity) ||
    (field === "unit" && newUnit !== target.unit);

  if (quantityOrUnitChanged && target.source) {
    const base = await getBaseFoodForEdit(
      target.source,
      target.customFoodId,
      target.usdaFdcId,
      target.communityFoodId,
      userId,
    );
    if (base) {
      const scaled = scaleMacros(
        base.baseMacros,
        base.baseServingSize,
        newQuantity,
        newUnit,
      );
      changes.calories = scaled.calories;
      changes.proteinG = scaled.proteinG;
      changes.carbsG = scaled.carbsG;
      changes.fatG = scaled.fatG;
    }
  }

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
      return [await handleEditItem(intent, context, userId)];

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
