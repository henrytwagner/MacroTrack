/**
 * kitchenModeSession.ts — Phase E Kitchen Mode WebSocket handler.
 *
 * Replaces the old voiceSession.ts turn-based state machine.
 * Session logic is function-call-driven: no state machine, no parsing intents.
 * Gemini Live handles all conversation; this file handles all DB + UI event side effects.
 *
 * Route: GET /ws/kitchen-mode
 * Protocol: same WSClientMessage / WSServerMessage types as before,
 *           plus WSAudioChunkMessage (client→server) and WSAudioDataMessage (server→client).
 */

import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { prisma } from "../db/client.js";
import { Prisma } from "@prisma/client";
import { verifyAccessToken } from "../services/jwt.js";
import {
  lookupFoodForKitchenMode,
  searchUsdaForKitchenMode,
  buildDraftItemFromRef,
  handleScaleConfirm,
  shouldDisambiguate,
} from "../services/foodParser.js";
import { GeminiLiveService } from "../services/GeminiLiveService.js";
import { searchFoods } from "../services/usda.js";
import { lookupBarcode } from "../services/barcodeLookup.js";
import { recategorizeMealsForDay } from "../services/mealCategorizer.js";

import type {
  DraftItem,
  FoodEntry,
  MealLabel,
  CreatingFoodProgress,
  CreatingFoodField,
  WSClientMessage,
  WSServerMessage,
  WSItemsAddedMessage,
  WSItemEditedMessage,
  WSItemRemovedMessage,
  WSOpenBarcodeScannerMessage,
  WSErrorMessage,
  WSSessionSavedMessage,
  WSSessionCancelledMessage,
  WSSessionPausedMessage,
  WSSessionResumedMessage,
  WSDraftReplacedMessage,
  WSCreateFoodPromptMessage,
  WSCreateFoodFieldMessage,
  WSCreateFoodCompleteMessage,
  WSFoodChoiceMessage,
  WSDisambiguateMessage,
  WSAudioDataMessage,
  WSServerTranscriptMessage,
  WSCameraCaptureMessage,
} from "../../../shared/types.js";

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

interface SavedSnapshot {
  confirmedFoodEntries: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    mealLabel: string;
    source: string;
    usdaFdcId?: number | null;
    customFoodId?: string | null;
    communityFoodId?: string | null;
    confirmedViaScale?: boolean;
  }>;
  draftItems: DraftItem[];
  customFoodsCreatedThisSession: string[];
}

interface KitchenSession {
  userId: string;
  date: string;
  voiceSessionId: string;
  items: DraftItem[];
  customFoodsCreatedThisSession: string[];
  draftHistory: DraftItem[][];
  redoStack: DraftItem[][];
  gemini: GeminiLiveService;
  socket: WebSocket;
  completed: boolean;
  isResuming: boolean;
  /** Tracks a food_choice card awaiting user decision (create vs USDA) */
  pendingChoiceId: string | null;
  pendingChoiceName: string | null;
  /** Tracks a barcode GTIN from a scan that triggered the choice card */
  pendingBarcodeGtin: string | null;
  /** Tracks a food currently being created via report_nutrition_field calls */
  pendingCreationId: string | null;
  pendingCreationName: string | null;
  pendingCreationValues: Partial<CreatingFoodProgress>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function send(socket: WebSocket, message: WSServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/** Provisional meal label for draft items — overwritten by recategorizeMealsForDay on save. */
function getProvisionalMealLabel(): MealLabel {
  return "snack";
}

function snapshotDraft(session: KitchenSession): void {
  session.draftHistory.push([...session.items]);
  if (session.draftHistory.length > 10) session.draftHistory.shift();
  session.redoStack = [];
}

/** Summary of the current draft state — appended to every function call response as _draft. */
function draftSummary(session: KitchenSession): object {
  return {
    item_count: session.items.length,
    items: session.items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      state: i.state,
    })),
    pending_creation: session.pendingCreationId
      ? { id: session.pendingCreationId, name: session.pendingCreationName }
      : null,
    pending_choice: session.pendingChoiceId
      ? { id: session.pendingChoiceId, name: session.pendingChoiceName }
      : null,
  };
}

/**
 * Centralized helper for notifying Gemini about non-voice input events.
 * Every input source (touch, scale, barcode, camera, AR) uses this to keep
 * Gemini's context in sync. Includes current draft summary so Gemini always
 * knows the full state.
 */
function notifyGemini(
  session: KitchenSession,
  event: { source: string; action: string; details: string },
): void {
  const draft = draftSummary(session);
  const msg = `[${event.source}] ${event.action}: ${event.details}\n\nCurrent draft: ${JSON.stringify(draft)}`;
  console.log(`[KitchenMode] notifyGemini — ${event.source}/${event.action}`);
  session.gemini.sendText(msg);
}

// ---------------------------------------------------------------------------
// Function call handlers
// Each handler mutates session state and/or sends WS messages to the iOS client.
// Returns a plain object that is sent back to Gemini as the tool response.
// ---------------------------------------------------------------------------

async function handleLookupFood(
  args: Record<string, unknown>,
  session: KitchenSession,
): Promise<unknown> {
  const name = String(args.name ?? "");
  if (!name) return { error: "name is required" };
  const brand = args.brand ? String(args.brand) : undefined;

  const result = await lookupFoodForKitchenMode(name, session.userId, brand);

  if (result.status === "not_found") {
    const choiceId = `tmp-choice-${Date.now()}`;
    session.pendingChoiceId = choiceId;
    session.pendingChoiceName = name;

    send(session.socket, {
      type: "food_choice",
      itemId: choiceId,
      foodName: name,
      question: "",
    } satisfies WSFoodChoiceMessage);

    return {
      status: "not_found",
      name,
      message:
        "Food not found in any database (personal, community, or USDA). A choice card is already shown to the user. Briefly tell the user it wasn't found, then ask whether they'd like to create a custom food (say 'create it') or try searching with different terms (say 'search again'). Wait for their choice — do not proceed until they respond.",
    };
  }

  if (result.status === "multiple") {
    // USDA returned multiple close candidates — treat as not_found rather than auto-disambiguating.
    // Disambiguation is reserved for when the user explicitly taps "Try USDA" (handleSearchUsda).
    const choiceId = `tmp-choice-${Date.now()}`;
    session.pendingChoiceId = choiceId;
    session.pendingChoiceName = name;

    send(session.socket, {
      type: "food_choice",
      itemId: choiceId,
      foodName: name,
      question: "",
    } satisfies WSFoodChoiceMessage);

    return {
      status: "not_found",
      name,
      message:
        "Food not found with high confidence. A choice card is shown to the user. Briefly tell the user it wasn't found, then ask whether they'd like to create a custom food (say 'create it') or try USDA (say 'try USDA'). Wait for their choice — do not proceed until they respond.",
    };
  }

  // Single match — check if USDA and whether to verbally warn
  let usdaNote: string | undefined;
  if (result.source === "DATABASE") {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { suppressUsdaWarning: true },
    });
    if (!user?.suppressUsdaWarning) {
      usdaNote =
        "This food came from the USDA database, which can have inconsistent serving sizes and nutrient data. Briefly mention this to the user before confirming.";
    }
  }

  // Fetch custom unit conversions for this food
  const [refType, refId] = result.foodRef.split(":") as [string, string];
  const convWhere = refType === "custom"
    ? { userId: session.userId, customFoodId: refId }
    : refType === "usda"
      ? { userId: session.userId, usdaFdcId: parseInt(refId, 10) }
      : undefined;
  const customConversions = convWhere
    ? await prisma.foodUnitConversion.findMany({ where: convWhere, select: { unitName: true } })
    : [];
  const availableUnits = [
    result.servingUnit,
    "servings",
    ...customConversions.map((c) => c.unitName),
  ];

  return {
    status: "found",
    food_ref: result.foodRef,
    name: result.name,
    source: result.source,
    calories_per_serving: result.caloriesPerServing,
    protein_g_per_serving: result.proteinGPerServing,
    carbs_g_per_serving: result.carbsGPerServing,
    fat_g_per_serving: result.fatGPerServing,
    serving_size: result.servingSize,
    serving_unit: result.servingUnit,
    ...(availableUnits.length > 2 ? { available_units: availableUnits } : {}),
    ...(usdaNote ? { note: usdaNote } : {}),
  };
}

async function handleAddToDraft(
  args: Record<string, unknown>,
  session: KitchenSession,
): Promise<unknown> {
  const foodRef = String(args.food_ref ?? "");
  const quantity = Number(args.quantity ?? 1);
  const unit = String(args.unit ?? "servings");
  const mealLabelArg = args.meal_label as MealLabel | undefined;
  const mealLabel: MealLabel = mealLabelArg ?? getProvisionalMealLabel();
  const quantitySpecified = Boolean(args.quantity_specified ?? false);

  if (!foodRef) return { error: "food_ref is required" };

  const draft = await buildDraftItemFromRef(
    foodRef,
    quantity,
    unit,
    mealLabel,
    session.userId,
  );

  if (!draft) {
    return { error: `Could not build draft item from ref: ${foodRef}. Food may no longer exist.` };
  }

  draft.isAssumed = !quantitySpecified;

  snapshotDraft(session);
  session.items.push(draft);

  send(session.socket, {
    type: "items_added",
    items: [draft],
  } satisfies WSItemsAddedMessage);

  return {
    success: true,
    item_id: draft.id,
    name: draft.name,
    quantity: draft.quantity,
    unit: draft.unit,
    calories: draft.calories,
  };
}

function handleBeginCustomFoodCreation(
  _args: Record<string, unknown>,
  session: KitchenSession,
): unknown {
  if (!session.pendingChoiceId) {
    return { error: "No pending food choice. Call lookup_food first." };
  }

  // Remove the food_choice card, then add a creating card with the same ID
  const creationId = session.pendingChoiceId;
  const foodName = session.pendingChoiceName ?? "";
  send(session.socket, { type: "item_removed", itemId: creationId } satisfies WSItemRemovedMessage);
  send(session.socket, {
    type: "create_food_prompt",
    itemId: creationId,
    foodName,
    question: "",
  } satisfies WSCreateFoodPromptMessage);

  session.pendingCreationId = creationId;
  session.pendingCreationName = foodName;
  session.pendingCreationValues = {};
  session.pendingChoiceId = null;
  session.pendingChoiceName = null;

  return {
    success: true,
    message:
      "Creation card is shown. Ask for each nutrition value one at a time. Call report_nutrition_field() for every value as it is stated. Required: calories, protein_g, carbs_g, fat_g, serving_size, serving_unit. When all are collected, call create_custom_food().",
  };
}

async function handleSearchUsda(
  args: Record<string, unknown>,
  session: KitchenSession,
): Promise<unknown> {
  const name = String(args.name ?? session.pendingChoiceName ?? "");
  if (!name) return { error: "name is required" };

  // Remove the food_choice card
  if (session.pendingChoiceId) {
    send(session.socket, {
      type: "item_removed",
      itemId: session.pendingChoiceId,
    } satisfies WSItemRemovedMessage);
    session.pendingChoiceId = null;
    session.pendingChoiceName = null;
    session.pendingBarcodeGtin = null;
  }

  const result = await searchUsdaForKitchenMode(name);

  if (result.status === "not_found") {
    return {
      status: "not_found",
      name,
      message: "No results found in USDA for this food. Tell the user and ask if they'd like to create a custom food instead.",
    };
  }

  if (result.status === "multiple") {
    send(session.socket, {
      type: "disambiguate",
      itemId: `tmp-dis-${Date.now()}`,
      foodName: name,
      question: "Multiple USDA matches found. Which did you mean?",
      options: result.options.map((o) => ({
        label: `${o.name} — ${o.caloriesPerServing} cal / serving`,
        usdaResult: {
          fdcId: parseInt(o.foodRef.split(":")[1], 10),
          description: o.name,
          servingSize: o.servingSize,
          servingSizeUnit: o.servingUnit,
          macros: {
            calories: o.caloriesPerServing,
            proteinG: o.proteinGPerServing,
            carbsG: o.carbsGPerServing,
            fatG: o.fatGPerServing,
          },
        },
      })),
    } satisfies WSDisambiguateMessage);

    return {
      status: "multiple_matches",
      options: result.options.map((o) => ({
        food_ref: o.foodRef,
        name: o.name,
        calories_per_serving: o.caloriesPerServing,
        serving_size: o.servingSize,
        serving_unit: o.servingUnit,
      })),
      message:
        "Multiple USDA matches are shown to the user. Present options briefly and wait for their choice, then call add_to_draft with the chosen food_ref.",
    };
  }

  // Single match — return to Gemini to call add_to_draft
  return {
    status: "found",
    food_ref: result.foodRef,
    name: result.name,
    source: result.source,
    calories_per_serving: result.caloriesPerServing,
    protein_g_per_serving: result.proteinGPerServing,
    carbs_g_per_serving: result.carbsGPerServing,
    fat_g_per_serving: result.fatGPerServing,
    serving_size: result.servingSize,
    serving_unit: result.servingUnit,
    note: "This is a USDA result — USDA data can have inconsistent serving sizes. Briefly mention this before adding.",
  };
}

function handleReportNutritionField(
  args: Record<string, unknown>,
  session: KitchenSession,
): unknown {
  if (!session.pendingCreationId) {
    return { error: "No food creation in progress. Call lookup_food first." };
  }

  const fieldName = String(args.field_name ?? "");
  const rawValue = args.value;

  // Map Gemini field names → CreatingFoodProgress keys
  const progressKeyMap: Partial<Record<string, keyof Omit<CreatingFoodProgress, "currentField">>> = {
    calories:     "calories",
    protein_g:    "proteinG",
    carbs_g:      "carbsG",
    fat_g:        "fatG",
    serving_size: "servingSize",
    serving_unit: "servingUnit",
    brand:        "brand",
    barcode:      "barcode",
  };

  // Map Gemini field names → CreatingFoodField enum values (for the card state label)
  const cardFieldMap: Partial<Record<string, CreatingFoodField>> = {
    calories:     "calories",
    protein_g:    "protein",
    carbs_g:      "carbs",
    fat_g:        "fat",
    serving_size: "servingSize",
    serving_unit: "servingSize",
    brand:        "brand",
    barcode:      "barcode",
  };

  const progressKey = progressKeyMap[fieldName];
  if (progressKey) {
    const numericFields = new Set(["calories", "protein_g", "carbs_g", "fat_g", "serving_size"]);
    const coerced = numericFields.has(fieldName)
      ? Number(rawValue)
      : String(rawValue);
    (session.pendingCreationValues as Record<string, unknown>)[progressKey] = coerced;
  }

  const cardField: CreatingFoodField = cardFieldMap[fieldName] ?? "calories";
  const collectedValues: CreatingFoodProgress = {
    ...session.pendingCreationValues,
    currentField: cardField,
  };

  send(session.socket, {
    type: "create_food_field",
    itemId: session.pendingCreationId,
    foodName: session.pendingCreationName ?? "",
    field: cardField,
    question: "",
    collectedValues,
  } satisfies WSCreateFoodFieldMessage);

  return { success: true, field: fieldName };
}

async function handleCreateCustomFood(
  args: Record<string, unknown>,
  session: KitchenSession,
): Promise<unknown> {
  const name = String(args.name ?? "");
  const calories = Number(args.calories ?? 0);
  const proteinG = Number(args.protein_g ?? 0);
  const carbsG = Number(args.carbs_g ?? 0);
  const fatG = Number(args.fat_g ?? 0);
  const servingSize = Number(args.serving_size ?? 1);
  const servingUnit = String(args.serving_unit ?? "serving");
  const quantity = Number(args.quantity ?? 1);
  const unit = String(args.unit ?? servingUnit);

  if (!name) return { error: "name is required" };

  // Capture and clear pending creation state so the draft card is replaced correctly
  const draftItemId = session.pendingCreationId ?? `tmp-${Date.now()}`;
  session.pendingCreationId = null;
  session.pendingCreationName = null;
  session.pendingCreationValues = {};

  // Create the custom food (attach barcode if this was triggered by a barcode scan)
  const barcodeGtin = session.pendingBarcodeGtin;
  session.pendingBarcodeGtin = null;

  const customFood = await prisma.customFood.create({
    data: {
      userId: session.userId,
      name,
      servingSize,
      servingUnit,
      calories,
      proteinG,
      carbsG,
      fatG,
      ...(barcodeGtin ? { barcode: barcodeGtin } : {}),
    },
  });

  session.customFoodsCreatedThisSession.push(customFood.id);

  // Compute macros for the logged quantity
  const isServings = unit.toLowerCase() === "servings" || unit.toLowerCase() === "serving";
  const ratio = isServings ? quantity : servingSize <= 0 ? 1 : quantity / servingSize;
  const mealLabel = getProvisionalMealLabel();

  snapshotDraft(session);
  const draftItem: DraftItem = {
    id: draftItemId,
    name: customFood.name,
    quantity,
    unit,
    calories: Math.round(calories * ratio),
    proteinG: Math.round(proteinG * ratio * 10) / 10,
    carbsG: Math.round(carbsG * ratio * 10) / 10,
    fatG: Math.round(fatG * ratio * 10) / 10,
    source: "CUSTOM",
    customFoodId: customFood.id,
    mealLabel,
    state: "normal",
  };
  session.items.push(draftItem);

  send(session.socket, {
    type: "create_food_complete",
    item: draftItem,
  } satisfies WSCreateFoodCompleteMessage);

  return {
    success: true,
    custom_food_id: customFood.id,
    item_id: draftItem.id,
    name: customFood.name,
  };
}

async function handleEditDraftItem(
  args: Record<string, unknown>,
  session: KitchenSession,
): Promise<unknown> {
  const itemId = String(args.item_id ?? "");
  const target = session.items.find((i) => i.id === itemId);
  if (!target) return { error: `Item not found: ${itemId}` };

  const newQty = args.quantity != null ? Number(args.quantity) : target.quantity;
  const newUnit = args.unit != null ? String(args.unit) : target.unit;

  const editMsg = await handleScaleConfirm(
    itemId,
    newQty,
    newUnit,
    session.items,
    session.userId,
  );

  if (editMsg.type === "item_edited") {
    snapshotDraft(session);
    const idx = session.items.findIndex((i) => i.id === itemId);
    if (idx !== -1) {
      session.items[idx] = { ...session.items[idx], ...editMsg.changes };
    }
    send(session.socket, editMsg);
    return { success: true };
  }

  return { error: editMsg.message };
}

function handleRemoveDraftItem(
  args: Record<string, unknown>,
  session: KitchenSession,
): unknown {
  const itemId = String(args.item_id ?? "");
  const idx = session.items.findIndex((i) => i.id === itemId);
  if (idx === -1) return { error: `Item not found: ${itemId}` };

  snapshotDraft(session);
  session.items.splice(idx, 1);

  send(session.socket, {
    type: "item_removed",
    itemId,
  } satisfies WSItemRemovedMessage);

  return { success: true };
}

function handleAbandonCreation(session: KitchenSession): unknown {
  if (!session.pendingCreationId) {
    return { error: "No food creation in progress." };
  }

  const creationId = session.pendingCreationId;
  const creationName = session.pendingCreationName ?? "";

  // Remove the creation card from items if it was added to the array
  const idx = session.items.findIndex((i) => i.id === creationId);
  if (idx !== -1) {
    snapshotDraft(session);
    session.items.splice(idx, 1);
  }

  // Dismiss the creation card on the iOS client
  send(session.socket, {
    type: "item_removed",
    itemId: creationId,
  } satisfies WSItemRemovedMessage);

  // Clear all pending creation state
  session.pendingCreationId = null;
  session.pendingCreationName = null;
  session.pendingCreationValues = {};

  return { success: true, abandoned_food: creationName };
}

function handleUndo(session: KitchenSession): unknown {
  if (session.draftHistory.length === 0) {
    return { error: "Nothing to undo." };
  }
  session.redoStack.push([...session.items]);
  session.items = session.draftHistory.pop()!;

  send(session.socket, {
    type: "draft_replaced",
    draft: session.items,
    message: "Undone.",
  } satisfies WSDraftReplacedMessage);

  return { success: true, item_count: session.items.length };
}

function handleRedo(session: KitchenSession): unknown {
  if (session.redoStack.length === 0) {
    return { error: "Nothing to redo." };
  }
  session.draftHistory.push([...session.items]);
  session.items = session.redoStack.pop()!;

  send(session.socket, {
    type: "draft_replaced",
    draft: session.items,
    message: "Redone.",
  } satisfies WSDraftReplacedMessage);

  return { success: true, item_count: session.items.length };
}

function handleOpenBarcodeScanner(session: KitchenSession): unknown {
  send(session.socket, {
    type: "open_barcode_scanner",
  } satisfies WSOpenBarcodeScannerMessage);
  return { success: true };
}

async function handleSaveSession(session: KitchenSession): Promise<unknown> {
  if (session.completed) return { error: "Session already completed." };
  session.completed = true;

  const entries = session.items.filter((i) => i.state === "normal" || i.state === "pending");
  const entryDate = new Date(session.date);

  // Look up which items already exist as FoodEntries
  const existingEntries = await prisma.foodEntry.findMany({
    where: { voiceSessionId: session.voiceSessionId },
    select: { id: true },
  });
  const existingEntryIds = new Set(existingEntries.map((e) => e.id));

  await prisma.$transaction(async (tx) => {
    // Create FoodEntries for items not yet in DB
    const newItems = entries.filter((i) => !existingEntryIds.has(i.id));
    if (newItems.length > 0) {
      await tx.foodEntry.createMany({
        data: newItems.map((item) => ({
          userId: session.userId,
          date: entryDate,
          name: item.name,
          calories: item.calories,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          quantity: item.quantity,
          unit: item.unit,
          source: item.source,
          mealLabel: item.mealLabel,
          usdaFdcId: item.usdaFdcId ?? null,
          customFoodId: item.customFoodId ?? null,
          communityFoodId: item.communityFoodId ?? null,
          confirmedViaScale: item.confirmedViaScale ?? false,
          voiceSessionId: session.voiceSessionId,
        })),
      });
    }

    // Update already-persisted entries that may have been edited
    const existingItems = entries.filter((i) => existingEntryIds.has(i.id));
    for (const item of existingItems) {
      await tx.foodEntry.update({
        where: { id: item.id },
        data: {
          name: item.name,
          calories: item.calories,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          quantity: item.quantity,
          unit: item.unit,
        },
      });
    }

    // Mark session as completed, clear draft state
    await tx.voiceSession.update({
      where: { id: session.voiceSessionId },
      data: {
        status: "completed",
        endedAt: new Date(),
        date: entryDate,
        draftItems: Prisma.DbNull,
        savedSnapshot: Prisma.DbNull,
      },
    });
  });

  if (entries.length > 0) {
    await recategorizeMealsForDay(session.userId, entryDate);
  }

  send(session.socket, {
    type: "session_saved",
    entriesCount: entries.length,
  } satisfies WSSessionSavedMessage);

  return { success: true, entries_saved: entries.length };
}

async function handleCancelSession(session: KitchenSession): Promise<unknown> {
  if (session.completed) return { error: "Session already completed." };
  session.completed = true;

  if (session.isResuming) {
    // Revert to saved snapshot — restore pre-resume state
    const vsRecord = await prisma.voiceSession.findUnique({
      where: { id: session.voiceSessionId },
      select: { savedSnapshot: true },
    });

    const snapshot = vsRecord?.savedSnapshot as SavedSnapshot | null;
    if (snapshot) {
      await prisma.$transaction(async (tx) => {
        // Delete all current FoodEntries for this session
        await tx.foodEntry.deleteMany({
          where: { voiceSessionId: session.voiceSessionId },
        });

        // Re-create from snapshot
        if (snapshot.confirmedFoodEntries.length > 0) {
          const entryDate = new Date(session.date);
          await tx.foodEntry.createMany({
            data: snapshot.confirmedFoodEntries.map((e) => ({
              userId: session.userId,
              date: entryDate,
              name: e.name,
              calories: e.calories,
              proteinG: e.proteinG,
              carbsG: e.carbsG,
              fatG: e.fatG,
              quantity: e.quantity,
              unit: e.unit,
              source: e.source as any,
              mealLabel: e.mealLabel as any,
              usdaFdcId: e.usdaFdcId ?? null,
              customFoodId: e.customFoodId ?? null,
              communityFoodId: e.communityFoodId ?? null,
              confirmedViaScale: e.confirmedViaScale ?? false,
              voiceSessionId: session.voiceSessionId,
            })),
          });
        }

        // Delete custom foods created after the snapshot
        const snapshotFoodIds = new Set(snapshot.customFoodsCreatedThisSession);
        const newCustomFoods = session.customFoodsCreatedThisSession.filter(
          (id) => !snapshotFoodIds.has(id),
        );
        if (newCustomFoods.length > 0) {
          await tx.customFood.deleteMany({
            where: { id: { in: newCustomFoods }, userId: session.userId },
          });
        }

        // Restore draft items from snapshot
        await tx.voiceSession.update({
          where: { id: session.voiceSessionId },
          data: {
            status: "paused",
            draftItems: snapshot.draftItems.length > 0
              ? JSON.parse(JSON.stringify(snapshot.draftItems))
              : null,
          },
        });
      });
    }
  } else {
    // New session — original cancel behavior
    if (session.customFoodsCreatedThisSession.length > 0) {
      await prisma.customFood.deleteMany({
        where: {
          id: { in: session.customFoodsCreatedThisSession },
          userId: session.userId,
        },
      });
    }

    await prisma.voiceSession.update({
      where: { id: session.voiceSessionId },
      data: { status: "cancelled", endedAt: new Date() },
    });
  }

  send(session.socket, {
    type: "session_cancelled",
  } satisfies WSSessionCancelledMessage);

  return { success: true };
}

/**
 * Pause session — save confirmed items as FoodEntries, persist incomplete items as draft JSON.
 * Used for explicit pause (user taps save-for-now) and implicit pause (disconnect).
 */
async function handlePauseSession(session: KitchenSession): Promise<unknown> {
  if (session.completed) return { error: "Session already completed." };
  session.completed = true;

  const confirmedItems = session.items.filter((i) => i.state === "normal" || i.state === "pending");
  const incompleteItems = session.items.filter((i) => i.state !== "normal" && i.state !== "pending");
  const entryDate = new Date(session.date);

  // Build snapshot of current confirmed FoodEntries (pre-existing from earlier pauses)
  const existingEntries = await prisma.foodEntry.findMany({
    where: { voiceSessionId: session.voiceSessionId },
  });

  let newEntryCount = 0;

  const existingEntryIds = new Set(existingEntries.map((e) => e.id));

  await prisma.$transaction(async (tx) => {
    // Split items into new (not yet in DB) vs already-persisted
    const newItems = confirmedItems.filter((i) => !existingEntryIds.has(i.id));
    const existingItems = confirmedItems.filter((i) => existingEntryIds.has(i.id));

    if (newItems.length > 0) {
      await tx.foodEntry.createMany({
        data: newItems.map((item) => ({
          userId: session.userId,
          date: entryDate,
          name: item.name,
          calories: item.calories,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          quantity: item.quantity,
          unit: item.unit,
          source: item.source,
          mealLabel: item.mealLabel,
          usdaFdcId: item.usdaFdcId ?? null,
          customFoodId: item.customFoodId ?? null,
          communityFoodId: item.communityFoodId ?? null,
          confirmedViaScale: item.confirmedViaScale ?? false,
          voiceSessionId: session.voiceSessionId,
        })),
      });
      newEntryCount = newItems.length;
    }

    // Update entries that were already persisted but may have been edited
    for (const item of existingItems) {
      await tx.foodEntry.update({
        where: { id: item.id },
        data: {
          name: item.name,
          calories: item.calories,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          quantity: item.quantity,
          unit: item.unit,
        },
      });
    }

    // Delete entries that were removed during this session visit
    const currentItemIds = new Set(confirmedItems.map((i) => i.id));
    const deletedEntryIds = existingEntries
      .filter((e) => !currentItemIds.has(e.id) && !confirmedItems.some((c) => c.id.startsWith("tmp-") && c.name === e.name))
      .map((e) => e.id);
    if (deletedEntryIds.length > 0) {
      await tx.foodEntry.deleteMany({
        where: { id: { in: deletedEntryIds } },
      });
    }

    // Build and save snapshot for cancel-revert
    const allEntries = await tx.foodEntry.findMany({
      where: { voiceSessionId: session.voiceSessionId },
    });
    const snapshot: SavedSnapshot = {
      confirmedFoodEntries: allEntries.map((e) => ({
        id: e.id,
        name: e.name,
        quantity: e.quantity,
        unit: e.unit,
        calories: e.calories,
        proteinG: e.proteinG,
        carbsG: e.carbsG,
        fatG: e.fatG,
        mealLabel: e.mealLabel,
        source: e.source,
        usdaFdcId: e.usdaFdcId,
        customFoodId: e.customFoodId,
        communityFoodId: e.communityFoodId,
        confirmedViaScale: e.confirmedViaScale,
      })),
      draftItems: incompleteItems,
      customFoodsCreatedThisSession: session.customFoodsCreatedThisSession,
    };

    await tx.voiceSession.update({
      where: { id: session.voiceSessionId },
      data: {
        status: "paused",
        date: entryDate,
        draftItems: incompleteItems.length > 0 ? JSON.parse(JSON.stringify(incompleteItems)) : null,
        savedSnapshot: JSON.parse(JSON.stringify(snapshot)),
      },
    });
  });

  if (confirmedItems.length > 0) {
    await recategorizeMealsForDay(session.userId, entryDate);
  }

  send(session.socket, {
    type: "session_paused",
    entriesCount: confirmedItems.length,
    draftItemsCount: incompleteItems.length,
  } satisfies WSSessionPausedMessage);

  return { success: true, entries_saved: confirmedItems.length, drafts_preserved: incompleteItems.length };
}

// ---------------------------------------------------------------------------
// Main function call dispatcher
// ---------------------------------------------------------------------------

async function dispatchFunctionCall(
  name: string,
  args: Record<string, unknown>,
  session: KitchenSession,
): Promise<unknown> {
  let result: unknown;
  switch (name) {
    case "lookup_food":
      result = await handleLookupFood(args, session);
      break;
    case "add_to_draft":
      result = await handleAddToDraft(args, session);
      break;
    case "begin_custom_food_creation":
      result = handleBeginCustomFoodCreation(args, session);
      break;
    case "search_usda":
      result = await handleSearchUsda(args, session);
      break;
    case "report_nutrition_field":
      result = handleReportNutritionField(args, session);
      break;
    case "create_custom_food":
      result = await handleCreateCustomFood(args, session);
      break;
    case "edit_draft_item":
      result = await handleEditDraftItem(args, session);
      break;
    case "remove_draft_item":
      result = handleRemoveDraftItem(args, session);
      break;
    case "abandon_creation":
      result = handleAbandonCreation(session);
      break;
    case "undo":
      result = handleUndo(session);
      break;
    case "redo":
      result = handleRedo(session);
      break;
    case "open_barcode_scanner":
      result = handleOpenBarcodeScanner(session);
      break;
    case "save_session":
      result = await handleSaveSession(session);
      break;
    case "cancel_session":
      result = await handleCancelSession(session);
      break;
    case "pause_session":
      result = await handlePauseSession(session);
      break;
    default:
      console.warn(`[KitchenMode] unknown function call: ${name}`);
      result = { error: `Unknown function: ${name}` };
  }

  // Append draft summary to every response so Gemini always knows the current state
  if (result && typeof result === "object") {
    (result as Record<string, unknown>)._draft = draftSummary(session);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Barcode scan handler — adds directly to draft, notifies Gemini only for verbal feedback
// ---------------------------------------------------------------------------

async function handleBarcodeScan(
  gtin: string,
  session: KitchenSession,
): Promise<void> {
  // If a choice card is already showing (re-scan), cancel it first
  if (session.pendingChoiceId) {
    send(session.socket, {
      type: "item_removed",
      itemId: session.pendingChoiceId,
    } satisfies WSItemRemovedMessage);
    session.pendingChoiceId = null;
    session.pendingChoiceName = null;
    session.pendingBarcodeGtin = null;
  }

  const result = await lookupBarcode(gtin, session.userId);

  if (result.source === "not_found") {
    const choiceId = `tmp-barcode-${Date.now()}`;
    session.pendingChoiceId = choiceId;
    session.pendingChoiceName = result.normalizedGtin;
    session.pendingBarcodeGtin = result.normalizedGtin;

    send(session.socket, {
      type: "food_choice",
      itemId: choiceId,
      foodName: result.normalizedGtin,
      question: "",
    } satisfies WSFoodChoiceMessage);

    notifyGemini(session, {
      source: "barcode",
      action: "not_found",
      details:
        `GTIN ${result.normalizedGtin} — no matching food found. ` +
        `A choice card is already shown to the user. Briefly tell the user the scan didn't match. ` +
        `They can tap "Create new food" or "Search manually" on the card. Wait for their choice.`,
    });
    return;
  }

  // Build food_ref and default quantity/unit from the matched food
  let foodRef: string;
  let quantity: number;
  let unit: string;

  if (result.source === "custom") {
    const f = result.food;
    foodRef = `custom:${f.id}`;
    quantity = f.servingSize;
    unit = f.servingUnit;
  } else {
    const f = result.food;
    foodRef = `community:${f.id}`;
    quantity = 1;
    unit = (f as any).defaultServingUnit ?? "serving";
  }

  const draft = await buildDraftItemFromRef(
    foodRef,
    quantity,
    unit,
    getProvisionalMealLabel(),
    session.userId,
  );
  if (!draft) return;

  draft.isAssumed = true; // barcode quantities are always default/assumed

  snapshotDraft(session);
  session.items.push(draft);

  send(session.socket, {
    type: "items_added",
    items: [draft],
  } satisfies WSItemsAddedMessage);

  // Notify Gemini so it can verbally confirm (if audio feedback is active)
  notifyGemini(session, {
    source: "barcode",
    action: "food_added",
    details:
      `Added "${draft.name}" (${draft.quantity} ${draft.unit}) to draft via barcode scan. ` +
      `Do NOT call add_to_draft — the item is already added. Just briefly confirm it.`,
  });
}

// ---------------------------------------------------------------------------
// Camera capture handler
// ---------------------------------------------------------------------------

function handleCameraCapture(
  msg: WSCameraCaptureMessage,
  session: KitchenSession,
): void {
  console.log("[KitchenMode] handleCameraCapture — sending image to Gemini Live");

  // Send image + prompt as a single ordered turn so Gemini receives both together.
  // Do NOT use sendRealtimeInput/media — that is for streaming video frames and
  // has non-deterministic ordering, causing Gemini to respond before seeing the image.
  const depthInfo = msg.depthContext ? ` Depth context: ${msg.depthContext}.` : "";
  const voiceOn = msg.voiceEnabled !== false; // default true if omitted

  const prompt = voiceOn
    ? `[camera] User tapped to identify food in a photo.${depthInfo} ` +
      `Examine the image and identify all visible food items. ` +
      `List what you see and ask the user which items to add to their log.`
    : `[camera] User tapped to identify food. Voice is disabled — no voice reply will come.${depthInfo} ` +
      `Examine the image, identify all visible food items, and add them all to the draft immediately ` +
      `using lookup_food then add_to_draft. Do not ask for confirmation.`;

  session.gemini.sendImageWithPrompt(msg.imageBase64, prompt);
}

// ---------------------------------------------------------------------------
// Fastify route registration
// ---------------------------------------------------------------------------

export async function kitchenModeSessionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/ws/kitchen-mode",
    { websocket: true },
    async (socket: WebSocket, request) => {
      const query = request.query as Record<string, string>;
      const token = query.token;
      if (!token) {
        socket.close(4001, "Missing auth token");
        return;
      }
      let userId: string;
      try {
        ({ userId } = await verifyAccessToken(token));
      } catch {
        socket.close(4001, "Invalid or expired token");
        return;
      }
      const dateParam = query.date;
      const date =
        dateParam ??
        new Date().toISOString().slice(0, 10);

      const resumeSessionId = query.sessionId;
      let isResuming = false;
      let voiceSessionId: string;
      let resumedItems: DraftItem[] = [];

      if (resumeSessionId) {
        // Resume an existing paused session
        const existing = await prisma.voiceSession.findUnique({
          where: { id: resumeSessionId },
          include: { foodEntries: true },
        });

        if (!existing || existing.userId !== userId || existing.status !== "paused") {
          socket.close(4002, "Session not found or not resumable");
          return;
        }

        isResuming = true;
        voiceSessionId = existing.id;

        // Convert persisted FoodEntries back to DraftItem format
        for (const entry of existing.foodEntries) {
          resumedItems.push({
            id: entry.id,
            name: entry.name,
            quantity: entry.quantity,
            unit: entry.unit,
            calories: entry.calories,
            proteinG: entry.proteinG,
            carbsG: entry.carbsG,
            fatG: entry.fatG,
            source: entry.source as any,
            mealLabel: entry.mealLabel as MealLabel,
            state: "normal",
            confirmedViaScale: entry.confirmedViaScale,
            usdaFdcId: entry.usdaFdcId ?? undefined,
            customFoodId: entry.customFoodId ?? undefined,
            communityFoodId: entry.communityFoodId ?? undefined,
          });
        }

        // Append stored incomplete draft items
        const storedDrafts = existing.draftItems as DraftItem[] | null;
        if (storedDrafts && Array.isArray(storedDrafts)) {
          resumedItems.push(...storedDrafts);
        }

        // Build fresh snapshot for cancel-revert (current state = revert target)
        const snapshot: SavedSnapshot = {
          confirmedFoodEntries: existing.foodEntries.map((e) => ({
            id: e.id,
            name: e.name,
            quantity: e.quantity,
            unit: e.unit,
            calories: e.calories,
            proteinG: e.proteinG,
            carbsG: e.carbsG,
            fatG: e.fatG,
            mealLabel: e.mealLabel,
            source: e.source,
            usdaFdcId: e.usdaFdcId,
            customFoodId: e.customFoodId,
            communityFoodId: e.communityFoodId,
            confirmedViaScale: e.confirmedViaScale,
          })),
          draftItems: storedDrafts ?? [],
          customFoodsCreatedThisSession: [],
        };

        await prisma.voiceSession.update({
          where: { id: voiceSessionId },
          data: {
            status: "active",
            savedSnapshot: JSON.parse(JSON.stringify(snapshot)),
          },
        });

        console.log(`[KitchenMode] resuming session ${voiceSessionId} — ${resumedItems.length} items, date: ${date}`);
      } else {
        // Create a brand-new session
        const voiceSessionRecord = await prisma.voiceSession.create({
          data: { userId, date: new Date(date) },
        });
        voiceSessionId = voiceSessionRecord.id;
        console.log(`[KitchenMode] new session ${voiceSessionId} — user: ${userId}, date: ${date}`);
      }

      const session: KitchenSession = {
        userId,
        date,
        voiceSessionId,
        items: resumedItems,
        customFoodsCreatedThisSession: [],
        draftHistory: [],
        redoStack: [],
        completed: false,
        isResuming,
        socket,
        gemini: null as unknown as GeminiLiveService, // set below
        pendingChoiceId: null,
        pendingChoiceName: null,
        pendingBarcodeGtin: null,
        pendingCreationId: null,
        pendingCreationName: null,
        pendingCreationValues: {},
      };

      // Create Gemini Live service
      let gemini: GeminiLiveService;
      try {
        gemini = new GeminiLiveService({
          onAudioOut: (data, mimeType) => {
            send(socket, {
              type: "audio_data",
              data,
              mimeType,
            } satisfies WSAudioDataMessage);
          },
          onTranscript: (text, isFinal) => {
            send(socket, {
              type: "transcript",
              text,
              isFinal,
            } satisfies WSServerTranscriptMessage);
          },
          onFunctionCall: async (name, args) => {
            return dispatchFunctionCall(name, args, session);
          },
          onError: (err) => {
            console.error("[KitchenMode] Gemini error:", err);
            send(socket, {
              type: "error",
              message: `Gemini connection error: ${err.message}`,
            } satisfies WSErrorMessage);
          },
          onClose: () => {
            console.log("[KitchenMode] Gemini session closed");
          },
          onOpen: () => {
            console.log("[KitchenMode] Gemini session ready");
          },
        });
      } catch (err) {
        console.error("[KitchenMode] failed to create GeminiLiveService:", err);
        send(socket, {
          type: "error",
          message: "Server configuration error: Gemini API key not set.",
        } satisfies WSErrorMessage);
        socket.close();
        return;
      }

      session.gemini = gemini;

      // Connect to Gemini Live
      try {
        await gemini.connect();
      } catch (err) {
        console.error("[KitchenMode] Gemini connect failed:", err);
        send(socket, {
          type: "error",
          message: "Failed to connect to Gemini Live. Check API key and quota.",
        } satisfies WSErrorMessage);
        socket.close();
        return;
      }

      // On resume: send items to client and inject context into Gemini
      if (isResuming && resumedItems.length > 0) {
        send(socket, {
          type: "session_resumed",
          items: resumedItems,
        } satisfies WSSessionResumedMessage);

        const itemList = resumedItems
          .map((i) => `- ${i.name}: ${i.quantity} ${i.unit} (${i.state})`)
          .join("\n");
        gemini.sendText(
          `[system] This is a RESUMED session. The user already has these items in their draft:\n${itemList}\n` +
          `Items with state "normal" are confirmed. Other states are incomplete — do NOT ask about them unless the user brings them up. ` +
          `Just wait for the user to tell you what else they want to add.`,
        );
      }

      // -----------------------------------------------------------------------
      // Heartbeat — keeps Railway proxy (and other intermediaries) alive.
      // Sends a WebSocket ping every 20 s. If the client doesn't pong within
      // 10 s, we consider it dead and close the socket.
      // -----------------------------------------------------------------------
      let pongReceived = true;
      const PING_INTERVAL_MS = 20_000;
      const PONG_TIMEOUT_MS = 10_000;
      let pongTimer: ReturnType<typeof setTimeout> | null = null;

      const pingInterval = setInterval(() => {
        if (socket.readyState !== socket.OPEN) {
          clearInterval(pingInterval);
          return;
        }
        if (!pongReceived) {
          console.warn("[KitchenMode] pong not received — closing dead connection");
          clearInterval(pingInterval);
          socket.close();
          return;
        }
        pongReceived = false;
        socket.ping();
        pongTimer = setTimeout(() => {
          if (!pongReceived && socket.readyState === socket.OPEN) {
            console.warn("[KitchenMode] pong timeout — closing connection");
            clearInterval(pingInterval);
            socket.close();
          }
        }, PONG_TIMEOUT_MS);
      }, PING_INTERVAL_MS);

      socket.on("pong", () => {
        pongReceived = true;
        if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
      });

      // Handle incoming client messages
      let audioChunkCount = 0;
      // End-of-turn timer: fires when no audio chunk arrives for 1500 ms.
      // Tells Gemini "the user finished speaking" so its VAD isn't the only trigger.
      // chunksAfterLastEnd tracks whether new audio arrived since the last audioStreamEnd;
      // prevents repeated end signals on silence bursts after Gemini responds.
      let audioEndTimer: ReturnType<typeof setTimeout> | null = null;
      let chunksAfterLastEnd = 0;
      const AUDIO_END_SILENCE_MS = Number(process.env.AUDIO_END_SILENCE_MS) || 1500;

      socket.on("message", (raw: Buffer) => {
        let msg: WSClientMessage;
        try {
          msg = JSON.parse(raw.toString()) as WSClientMessage;
        } catch {
          console.warn("[KitchenMode] invalid JSON from client");
          return;
        }

        switch (msg.type) {
          case "audio_chunk":
            audioChunkCount++;
            chunksAfterLastEnd++;
            if (audioChunkCount <= 10 || audioChunkCount % 50 === 0) {
              const byteEst = Math.floor(msg.data.length * 0.75);
              console.log(`[KitchenMode] → audio_chunk #${audioChunkCount}, ~${byteEst} bytes`);
            }
            gemini.sendAudio(msg.data);
            // Reset end-of-turn timer on every chunk
            if (audioEndTimer) clearTimeout(audioEndTimer);
            audioEndTimer = setTimeout(() => {
              audioEndTimer = null;
              // Only send if new audio arrived since the last audioStreamEnd
              if (chunksAfterLastEnd > 0) {
                chunksAfterLastEnd = 0;
                gemini.sendAudioEnd();
              }
            }, AUDIO_END_SILENCE_MS);
            break;

          case "barcode_scan":
            void handleBarcodeScan(msg.gtin, session);
            break;

          case "camera_capture":
            handleCameraCapture(msg, session);
            break;

          case "scale_confirm":
            void (async () => {
              const editMsg = await handleScaleConfirm(
                msg.itemId,
                msg.quantity,
                msg.unit,
                session.items,
                session.userId,
              );
              if (editMsg.type === "item_edited") {
                snapshotDraft(session);
                const idx = session.items.findIndex((i) => i.id === msg.itemId);
                const itemName = idx !== -1 ? session.items[idx].name : msg.itemId;
                if (idx !== -1) {
                  session.items[idx] = { ...session.items[idx], ...editMsg.changes, confirmedViaScale: true };
                }
                send(socket, editMsg);
                notifyGemini(session, {
                  source: "scale",
                  action: "weight_confirmed",
                  details: `${itemName} now ${msg.quantity} ${msg.unit}`,
                });
              } else {
                send(socket, editMsg);
              }
            })();
            break;

          case "save":
            void handleSaveSession(session);
            break;

          case "cancel":
            void handleCancelSession(session);
            break;

          case "pause":
            // Merge local items (added via touch/search, not on server) into session
            if (msg.localItems && Array.isArray(msg.localItems)) {
              for (const item of msg.localItems as DraftItem[]) {
                if (!session.items.some((i) => i.id === item.id)) {
                  session.items.push(item);
                }
              }
            }
            void handlePauseSession(session);
            break;

          case "transcript":
            // Old protocol: RN app sends text transcripts.
            // Not used by Swift client (which sends audio_chunk), but kept for compatibility.
            console.log("[KitchenMode] received legacy transcript (ignored — use audio_chunk)");
            break;

          case "touch_edit_item":
            void (async () => {
              const editMsg = await handleScaleConfirm(
                msg.itemId,
                msg.quantity,
                msg.unit,
                session.items,
                session.userId,
              );
              if (editMsg.type === "item_edited") {
                snapshotDraft(session);
                const idx = session.items.findIndex((i) => i.id === msg.itemId);
                const itemName = idx !== -1 ? session.items[idx].name : msg.itemId;
                if (idx !== -1) {
                  session.items[idx] = { ...session.items[idx], ...editMsg.changes };
                }
                send(socket, editMsg);
                notifyGemini(session, {
                  source: "touch",
                  action: "edit_item",
                  details: `${itemName} quantity → ${msg.quantity} ${msg.unit}`,
                });
              } else {
                send(socket, {
                  type: "error",
                  message: `Failed to edit item: ${msg.itemId}`,
                } satisfies WSErrorMessage);
              }
            })();
            break;

          case "touch_remove_item": {
            const idx = session.items.findIndex((i) => i.id === msg.itemId);
            if (idx !== -1) {
              const itemName = session.items[idx].name;
              snapshotDraft(session);
              session.items.splice(idx, 1);
              send(socket, {
                type: "item_removed",
                itemId: msg.itemId,
              } satisfies WSItemRemovedMessage);
              notifyGemini(session, {
                source: "touch",
                action: "remove_item",
                details: itemName,
              });
            }
            break;
          }

          case "touch_dismiss_choice": {
            if (session.pendingChoiceId === msg.itemId) {
              session.pendingChoiceId = null;
              session.pendingChoiceName = null;
              session.pendingBarcodeGtin = null;
            }
            break;
          }

          case "touch_complete_creation":
            void (async () => {
              // Clear pending creation state if this item was mid-creation via voice
              if (session.pendingCreationId === msg.itemId) {
                session.pendingCreationId = null;
                session.pendingCreationName = null;
                session.pendingCreationValues = {};
              }

              // Attach barcode if this creation was triggered by a barcode scan
              const barcodeGtin = session.pendingBarcodeGtin;
              session.pendingBarcodeGtin = null;

              const customFood = await prisma.customFood.create({
                data: {
                  userId: session.userId,
                  name: msg.name,
                  servingSize: msg.servingSize,
                  servingUnit: msg.servingUnit,
                  calories: msg.calories,
                  proteinG: msg.proteinG,
                  carbsG: msg.carbsG,
                  fatG: msg.fatG,
                  ...(barcodeGtin ? { barcode: barcodeGtin } : {}),
                },
              });

              session.customFoodsCreatedThisSession.push(customFood.id);
              const mealLabel = getProvisionalMealLabel();

              snapshotDraft(session);
              const draftItem: DraftItem = {
                id: msg.itemId,
                name: customFood.name,
                quantity: 1,
                unit: "servings",
                calories: Math.round(msg.calories),
                proteinG: Math.round(msg.proteinG * 10) / 10,
                carbsG: Math.round(msg.carbsG * 10) / 10,
                fatG: Math.round(msg.fatG * 10) / 10,
                source: "CUSTOM",
                customFoodId: customFood.id,
                mealLabel,
                state: "normal",
              };

              // Replace creating item if it exists, otherwise push
              const existingIdx = session.items.findIndex((i) => i.id === msg.itemId);
              if (existingIdx !== -1) {
                session.items[existingIdx] = draftItem;
              } else {
                session.items.push(draftItem);
              }

              send(socket, {
                type: "create_food_complete",
                item: draftItem,
              } satisfies WSCreateFoodCompleteMessage);

              notifyGemini(session, {
                source: "touch",
                action: "complete_creation",
                details: `${msg.name} — creation resolved, do not ask for nutrition values`,
              });
            })();
            break;

          default:
            console.warn("[KitchenMode] unhandled message type:", (msg as { type: string }).type);
        }
      });

      // Cleanup on disconnect — implicit pause to preserve session state
      socket.on("close", async () => {
        console.log(`[KitchenMode] client disconnected — completed: ${session.completed}`);
        clearInterval(pingInterval);
        if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
        if (audioEndTimer) { clearTimeout(audioEndTimer); audioEndTimer = null; }
        gemini.close();
        // Implicit pause on unexpected disconnect (network drop, app backgrounded)
        if (!session.completed && session.items.length > 0) {
          try {
            // Reuse handlePauseSession logic — it handles FoodEntry creation,
            // snapshot persistence, and VoiceSession status update
            await handlePauseSession(session);
            console.log(`[KitchenMode] Implicit pause on disconnect — session ${session.voiceSessionId}`);
          } catch (err) {
            console.error("[KitchenMode] Implicit pause on disconnect failed:", err);
          }
        } else if (!session.completed && session.items.length === 0) {
          // Empty session on disconnect — mark as cancelled
          try {
            await prisma.voiceSession.update({
              where: { id: session.voiceSessionId },
              data: { status: "cancelled", endedAt: new Date() },
            });
          } catch (err) {
            console.error("[KitchenMode] Cancel empty session on disconnect failed:", err);
          }
        }
      });

      socket.on("error", (err: Error) => {
        console.error("[KitchenMode] socket error:", err);
        gemini.close();
      });
    },
  );
}
