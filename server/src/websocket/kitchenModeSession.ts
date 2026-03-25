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
import { getDefaultUserId } from "../db/defaultUser.js";
import {
  lookupFoodForKitchenMode,
  searchUsdaForKitchenMode,
  buildDraftItemFromRef,
  handleScaleConfirm,
  shouldDisambiguate,
} from "../services/foodParser.js";
import { GeminiLiveService } from "../services/GeminiLiveService.js";
import { searchFoods } from "../services/usda.js";
import { recategorizeMealsForDay } from "../services/mealCategorizer.js";

import type {
  DraftItem,
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
  WSDraftReplacedMessage,
  WSCreateFoodPromptMessage,
  WSCreateFoodFieldMessage,
  WSCreateFoodCompleteMessage,
  WSFoodChoiceMessage,
  WSDisambiguateMessage,
  WSAudioDataMessage,
  WSServerTranscriptMessage,
} from "../../../shared/types.js";

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

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
  /** Tracks a food_choice card awaiting user decision (create vs USDA) */
  pendingChoiceId: string | null;
  pendingChoiceName: string | null;
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

  const result = await lookupFoodForKitchenMode(name, session.userId);

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
        "Food not found in this user's personal or community foods. A choice card is already shown to the user. Briefly tell the user it wasn't found, then ask whether they'd like to create a custom food (say 'create it') or search the USDA database (say 'try USDA', note that USDA data can be unreliable). Wait for their choice — do not proceed until they respond.",
    };
  }

  if (result.status === "multiple") {
    // Emit a disambiguate card to the iOS client so the user has a visual alongside Gemini's voice
    send(session.socket, {
      type: "disambiguate",
      itemId: `tmp-dis-${Date.now()}`,
      foodName: name,
      question: "Multiple matches found. Which one did you mean?",
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
        protein_g_per_serving: o.proteinGPerServing,
        carbs_g_per_serving: o.carbsGPerServing,
        fat_g_per_serving: o.fatGPerServing,
        serving_size: o.servingSize,
        serving_unit: o.servingUnit,
      })),
      message:
        "Present these options to the user verbally. When they choose, call add_to_draft with the chosen food_ref.",
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

  // Create the custom food
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
  if (entries.length > 0) {
    const entryDate = new Date(session.date);
    await prisma.foodEntry.createMany({
      data: entries.map((item) => ({
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
        voiceSessionId: session.voiceSessionId,
      })),
    });
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

  // Delete custom foods created during this session
  if (session.customFoodsCreatedThisSession.length > 0) {
    await prisma.customFood.deleteMany({
      where: {
        id: { in: session.customFoodsCreatedThisSession },
        userId: session.userId,
      },
    });
  }

  send(session.socket, {
    type: "session_cancelled",
  } satisfies WSSessionCancelledMessage);

  return { success: true };
}

// ---------------------------------------------------------------------------
// Main function call dispatcher
// ---------------------------------------------------------------------------

async function dispatchFunctionCall(
  name: string,
  args: Record<string, unknown>,
  session: KitchenSession,
): Promise<unknown> {
  switch (name) {
    case "lookup_food":
      return handleLookupFood(args, session);
    case "add_to_draft":
      return handleAddToDraft(args, session);
    case "begin_custom_food_creation":
      return handleBeginCustomFoodCreation(args, session);
    case "search_usda":
      return handleSearchUsda(args, session);
    case "report_nutrition_field":
      return handleReportNutritionField(args, session);
    case "create_custom_food":
      return handleCreateCustomFood(args, session);
    case "edit_draft_item":
      return handleEditDraftItem(args, session);
    case "remove_draft_item":
      return handleRemoveDraftItem(args, session);
    case "undo":
      return handleUndo(session);
    case "redo":
      return handleRedo(session);
    case "open_barcode_scanner":
      return handleOpenBarcodeScanner(session);
    case "save_session":
      return handleSaveSession(session);
    case "cancel_session":
      return handleCancelSession(session);
    default:
      console.warn(`[KitchenMode] unknown function call: ${name}`);
      return { error: `Unknown function: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Barcode scan handler (client → server → Gemini text turn)
// ---------------------------------------------------------------------------

async function handleBarcodeScan(
  gtin: string,
  session: KitchenSession,
): Promise<void> {
  const result = await prisma.customFood.findFirst({
    where: { userId: session.userId, barcode: gtin },
    select: { id: true, name: true, servingSize: true, servingUnit: true },
  });

  if (result) {
    // Give Gemini everything it needs to call add_to_draft immediately.
    session.gemini.sendText(
      `Barcode scan result: found custom food "${result.name}". ` +
      `Call add_to_draft with food_ref "custom:${result.id}", ` +
      `quantity ${result.servingSize}, unit "${result.servingUnit}". ` +
      `Do not ask the user for quantity — use these defaults.`,
    );
    return;
  }

  session.gemini.sendText(
    `Barcode scan result: GTIN ${gtin}. No matching food found in this user's custom foods. ` +
    `Please tell the user the scan didn't match anything and ask them to name the food so you can call lookup_food.`,
  );
}

// ---------------------------------------------------------------------------
// Fastify route registration
// ---------------------------------------------------------------------------

export async function kitchenModeSessionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/ws/kitchen-mode",
    { websocket: true },
    async (socket: WebSocket, request) => {
      const userId = await getDefaultUserId();
      const dateParam = (request.query as Record<string, string>).date;
      const date =
        dateParam ??
        new Date().toISOString().slice(0, 10);

      console.log(`[KitchenMode] new session — user: ${userId}, date: ${date}`);

      const voiceSessionRecord = await prisma.voiceSession.create({
        data: { userId },
      });

      const session: KitchenSession = {
        userId,
        date,
        voiceSessionId: voiceSessionRecord.id,
        items: [],
        customFoodsCreatedThisSession: [],
        draftHistory: [],
        redoStack: [],
        completed: false,
        socket,
        gemini: null as unknown as GeminiLiveService, // set below
        pendingChoiceId: null,
        pendingChoiceName: null,
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

      // Handle incoming client messages
      let audioChunkCount = 0;
      // End-of-turn timer: fires when no audio chunk arrives for 1500 ms.
      // Tells Gemini "the user finished speaking" so its VAD isn't the only trigger.
      // chunksAfterLastEnd tracks whether new audio arrived since the last audioStreamEnd;
      // prevents repeated end signals on silence bursts after Gemini responds.
      let audioEndTimer: ReturnType<typeof setTimeout> | null = null;
      let chunksAfterLastEnd = 0;
      const AUDIO_END_SILENCE_MS = 1500;

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
                if (idx !== -1) {
                  session.items[idx] = { ...session.items[idx], ...editMsg.changes };
                }
              }
              send(socket, editMsg);
            })();
            break;

          case "save":
            void handleSaveSession(session);
            break;

          case "cancel":
            void handleCancelSession(session);
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
                session.gemini.sendText(
                  `User edited ${itemName} quantity to ${msg.quantity} ${msg.unit} via touch.`
                );
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
              session.gemini.sendText(`User removed ${itemName} via touch.`);
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

              session.gemini.sendText(
                `User manually completed food creation for ${msg.name} via touch. The creation card has been resolved. Do not ask for nutrition values.`
              );
            })();
            break;

          default:
            console.warn("[KitchenMode] unhandled message type:", (msg as { type: string }).type);
        }
      });

      // Cleanup on disconnect
      socket.on("close", () => {
        console.log("[KitchenMode] client disconnected");
        if (audioEndTimer) { clearTimeout(audioEndTimer); audioEndTimer = null; }
        gemini.close();
      });

      socket.on("error", (err: Error) => {
        console.error("[KitchenMode] socket error:", err);
        gemini.close();
      });
    },
  );
}
