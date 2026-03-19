import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { prisma } from "../db/client.js";
import { getDefaultUserId } from "../db/defaultUser.js";
import { processTranscript, lookupItemInUsda, lookupFoodInfoOnly, shouldDisambiguate, handleScaleConfirm } from "../services/foodParser.js";
import { parseTranscript, estimateFood, suggestFoodsFromCandidates } from "../services/gemini.js";
import { searchFoods } from "../services/usda.js";

import type {
  DraftItem,
  CreatingFoodProgress,
  CreatingFoodField,
  WSClientMessage,
  WSServerMessage,
  WSSessionSavedMessage,
  WSSessionCancelledMessage,
  WSCreateFoodFieldMessage,
  WSCreateFoodCompleteMessage,
  WSCreateFoodConfirmMessage,
  WSItemRemovedMessage,
  WSErrorMessage,
  WSFoodChoiceMessage,
  WSUsdaConfirmMessage,
  WSItemsAddedMessage,
  WSOpenBarcodeScannerMessage,
  WSAskMessage,
  WSDraftReplacedMessage,
  WSOperationCancelledMessage,
  WSDisambiguateMessage,
  WSConfirmClearMessage,
  WSCommunitySubmitPromptMessage,
  WSHistoryResultsMessage,
  WSMacroSummaryMessage,
  WSFoodInfoMessage,
  WSFoodSuggestionsMessage,
  WSEstimateCardMessage,
  WSPromptScaleConfirmMessage,
  GeminiRequestContext,
  GeminiCreateFoodResponseIntent,
  GeminiConfirmFoodCreationIntent,
  MealLabel,
  USDASearchResult,
  DisambiguationOption,
  Macros,
  HistoryFoodEntry,
} from "../../../shared/types.js";
import { createCloudSttSession, type CloudSttSession } from "../voice/sttCloudClient.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip all non-digit characters from a barcode string. */
function normalizeBarcode(s: string): string {
  return s.replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
// Custom food creation flow constants
// ---------------------------------------------------------------------------

const CREATION_FIELDS: CreatingFoodField[] = [
  "confirm",
  "servingSize",
  "calories",
  "protein",
  "carbs",
  "fat",
  "brand",
  "barcode",
];

const CREATION_QUESTIONS: Record<CreatingFoodField, string> = {
  confirm: "", // set dynamically with the food name
  servingSize: "What's the serving size? For example, 100 grams or 1 cup.",
  calories: "How many calories per serving?",
  protein: "How much protein per serving?",
  carbs: "How many carbs?",
  fat: "And how much fat?",
  brand: "What brand is this? Say 'skip' if it doesn't have one.",
  barcode: "Does it have a barcode? Say the number or 'skip'.",
  complete: "",
};

function nextField(current: CreatingFoodField): CreatingFoodField {
  const idx = CREATION_FIELDS.indexOf(current);
  if (idx === -1 || idx >= CREATION_FIELDS.length - 1) return "complete";
  return CREATION_FIELDS[idx + 1];
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

interface VoiceSessionState {
  userId: string;
  date: string;
  draft: DraftItem[];
  sessionState:
    | "normal"
    | `creating:${string}`
    | `confirming:${string}`
    | `awaiting_choice:${string}`
    | `usda_pending:${string}`
    | `barcode_pending:${string}`
    | `barcode_naming:${string}`
    | `disambiguating:${string}`
    | "confirm_clear_pending"
    | `estimate_pending:${string}`;
  creatingFoodName: string;
  creatingFoodProgress: CreatingFoodProgress | null;
  creatingFoodInitialQuantity: number | null;
  creatingFoodInitialUnit: string | null;
  customFoodsCreatedThisSession: string[];
  completed: boolean; // true once save/cancel has been sent
  pendingUsdaResult: USDASearchResult | null;
  pendingUsdaItemName: string;
  pendingBarcodeGtin: string;
  pendingDisambiguationOptions: DisambiguationOption[];
  pendingDisambiguationName: string;
  /** Quantity from the parsed ADD_ITEMS intent, stored so food_choice handler can look it up. */
  pendingIntentItems: Array<{ name: string; quantity?: number; unit?: string }> | null;
  /** Pending initial qty/unit to transfer to creatingFoodInitial* when entering creating state. */
  pendingCreationInitialQuantity: number | null;
  pendingCreationInitialUnit: string | null;
  /** Undo history — snapshots of draft taken before each voice command. Max 10. */
  draftHistory: DraftItem[][];
  /** Redo stack — populated by UNDO, cleared on any new modification. */
  redoStack: DraftItem[][];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function send(socket: WebSocket, message: WSServerMessage) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function getTimeOfDay(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function getMealLabel(timeOfDay: string): MealLabel {
  const [h] = timeOfDay.split(":").map(Number);
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 14) return "lunch";
  if (h >= 14 && h < 17) return "snack";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

// ---------------------------------------------------------------------------
// Undo / redo helpers
// ---------------------------------------------------------------------------

/** Snapshot the current draft before a new voice command modifies it. */
function snapshotDraft(session: VoiceSessionState): void {
  if (session.draftHistory.length >= 10) {
    session.draftHistory.shift();
  }
  session.draftHistory.push([...session.draft]);
  session.redoStack = [];
}

function handleUndo(session: VoiceSessionState, socket: WebSocket): void {
  if (session.draftHistory.length === 0) {
    send(socket, { type: "ask", question: "Nothing to undo." } satisfies WSAskMessage);
    return;
  }
  const snapshot = session.draftHistory.pop()!;
  session.redoStack.push([...session.draft]);
  session.draft = snapshot;
  send(socket, {
    type: "draft_replaced",
    draft: session.draft,
    message: "Done, undone.",
  } satisfies WSDraftReplacedMessage);
}

function handleRedo(session: VoiceSessionState, socket: WebSocket): void {
  if (session.redoStack.length === 0) {
    send(socket, { type: "ask", question: "Nothing to redo." } satisfies WSAskMessage);
    return;
  }
  const snapshot = session.redoStack.pop()!;
  session.draftHistory.push([...session.draft]);
  session.draft = snapshot;
  send(socket, {
    type: "draft_replaced",
    draft: session.draft,
    message: "Done, redone.",
  } satisfies WSDraftReplacedMessage);
}

function draftContext(
  draft: DraftItem[],
): GeminiRequestContext["currentDraft"] {
  return draft.map((d) => ({
    id: d.id,
    name: d.name,
    quantity: d.quantity,
    unit: d.unit,
    source: d.source,
    customFoodId: d.customFoodId,
    usdaFdcId: d.usdaFdcId,
    communityFoodId: d.communityFoodId,
  }));
}

// ---------------------------------------------------------------------------
// Save / Cancel
// ---------------------------------------------------------------------------

async function saveSession(session: VoiceSessionState, socket: WebSocket) {
  if (session.completed) return;
  session.completed = true;

  const itemsToSave = session.draft.filter((item) => item.state === "normal");
  if (itemsToSave.length > 0) {
    await prisma.foodEntry.createMany({
      data: itemsToSave.map((item) => ({
        userId: session.userId,
        date: new Date(session.date + "T12:00:00"),
        mealLabel: item.mealLabel,
        name: item.name,
        calories: item.calories,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
        quantity: item.quantity,
        unit: item.unit,
        source: item.source,
        usdaFdcId: item.usdaFdcId ?? null,
        customFoodId: item.customFoodId ?? null,
        communityFoodId: item.communityFoodId ?? null,
      })),
    });
  }

  send(socket, {
    type: "session_saved",
    entriesCount: itemsToSave.length,
  } satisfies WSSessionSavedMessage);
}

async function cancelSession(session: VoiceSessionState, socket: WebSocket) {
  if (session.completed) return;
  session.completed = true;

  if (session.customFoodsCreatedThisSession.length > 0) {
    await prisma.customFood.deleteMany({
      where: { id: { in: session.customFoodsCreatedThisSession } },
    });
  }

  send(socket, { type: "session_cancelled" } satisfies WSSessionCancelledMessage);
}

// ---------------------------------------------------------------------------
// Custom food creation state machine
// ---------------------------------------------------------------------------

async function handleCreatingTranscript(
  text: string,
  session: VoiceSessionState,
  socket: WebSocket,
) {
  const tmpId = (session.sessionState as string).replace("creating:", "");
  const progress = session.creatingFoodProgress!;
  const currentField = progress.currentField;

  const context: GeminiRequestContext = {
    transcript: text,
    currentDraft: draftContext(session.draft),
    timeOfDay: getTimeOfDay(),
    date: session.date,
    sessionState: session.sessionState as GeminiRequestContext["sessionState"],
    creatingFoodProgress: progress,
  };

  let intent: GeminiCreateFoodResponseIntent;
  try {
    const raw = await parseTranscript(context);

    // CANCEL_OPERATION: abort creation, remove card
    if (raw.action === "CANCEL_OPERATION") {
      const foodName = session.creatingFoodName;
      session.draft = session.draft.filter((d) => d.id !== tmpId);
      session.sessionState = "normal";
      session.creatingFoodName = "";
      session.creatingFoodProgress = null;
      send(socket, {
        type: "operation_cancelled",
        itemId: tmpId,
        message: `Cancelled. ${foodName} won't be added.`,
      } satisfies WSOperationCancelledMessage);
      return;
    }

    if (raw.action !== "CREATE_FOOD_RESPONSE") {
      // User said something unrelated — re-prompt the current field
      const question =
        currentField === "confirm"
          ? `I couldn't find '${session.creatingFoodName}'. Would you like to create it?`
          : CREATION_QUESTIONS[currentField];
      send(socket, {
        type: "create_food_field",
        itemId: tmpId,
        foodName: session.creatingFoodName,
        field: currentField,
        question,
        collectedValues: { ...(session.creatingFoodProgress ?? {}) },
      } satisfies WSCreateFoodFieldMessage);
      return;
    }
    intent = raw as GeminiCreateFoodResponseIntent;
  } catch {
    send(socket, {
      type: "error",
      message: "I didn't catch that, could you say it again?",
    } satisfies WSErrorMessage);
    return;
  }

  const { field, value, unit } = intent.payload;

  // Handle "confirm" field
  if (field === "confirm") {
    if (!value) {
      // User declined — remove the creating card
      session.draft = session.draft.filter((d) => d.id !== tmpId);
      session.sessionState = "normal";
      session.creatingFoodName = "";
      session.creatingFoodProgress = null;
      send(socket, { type: "item_removed", itemId: tmpId } satisfies WSItemRemovedMessage);
      return;
    }
    // User confirmed — advance to serving size
    const nextF = nextField("confirm");
    progress.currentField = nextF;
    send(socket, {
      type: "create_food_field",
      itemId: tmpId,
      foodName: session.creatingFoodName,
      field: nextF,
      question: CREATION_QUESTIONS[nextF],
      collectedValues: { ...progress },
    } satisfies WSCreateFoodFieldMessage);
    return;
  }

  // Fill fields — brand/barcode are strings (skip = empty/undefined)
  if (field === "brand") {
    progress.brand = (typeof value === "string" && value) ? value.trim() : undefined;
  } else if (field === "barcode") {
    const raw = typeof value === "string" ? normalizeBarcode(value) : "";
    progress.barcode = raw || undefined; // undefined = skipped
  } else {
    // Numeric fields
    const numValue = typeof value === "number" ? value : Number(value) || 0;
    if (field === "servingSize") {
      progress.servingSize = numValue;
      progress.servingUnit = unit ?? "servings";
    } else if (field === "calories") {
      progress.calories = numValue;
    } else if (field === "protein") {
      progress.proteinG = numValue;
    } else if (field === "carbs") {
      progress.carbsG = numValue;
    } else if (field === "fat") {
      progress.fatG = numValue;
    }
  }

  const nextF = nextField(field);
  progress.currentField = nextF;

  if (nextF === "complete") {
    // All fields gathered — send confirmation card instead of saving immediately
    const quantityMismatch = !!session.creatingFoodInitialUnit
      && session.creatingFoodInitialUnit !== (progress.servingUnit ?? "servings");
    session.sessionState = `confirming:${tmpId}`;
    send(socket, {
      type: "create_food_confirm",
      itemId: tmpId,
      foodName: session.creatingFoodName,
      collectedValues: { ...progress },
      initialQuantity: session.creatingFoodInitialQuantity ?? undefined,
      initialUnit: session.creatingFoodInitialUnit ?? undefined,
      quantityMismatch,
    } satisfies WSCreateFoodConfirmMessage);
    return;
  }

  send(socket, {
    type: "create_food_field",
    itemId: tmpId,
    foodName: session.creatingFoodName,
    field: nextF,
    question: CREATION_QUESTIONS[nextF],
    collectedValues: { ...progress },
  } satisfies WSCreateFoodFieldMessage);
}

// ---------------------------------------------------------------------------
// Normal transcript flow
// ---------------------------------------------------------------------------

async function handleNormalTranscript(
  text: string,
  session: VoiceSessionState,
  socket: WebSocket,
) {
  const context: GeminiRequestContext = {
    transcript: text,
    currentDraft: draftContext(session.draft),
    timeOfDay: getTimeOfDay(),
    date: session.date,
    sessionState: "normal",
  };

  // Check intent before full processing — intercept special actions
  try {
    const intent = await parseTranscript(context);
    // Store ADD_ITEMS items so food_choice handler can look up the original quantity
    if (intent.action === "ADD_ITEMS") {
      session.pendingIntentItems = intent.payload.items;
    }
    if (intent.action === "OPEN_BARCODE_SCANNER") {
      send(socket, { type: "open_barcode_scanner" } satisfies WSOpenBarcodeScannerMessage);
      return;
    }
    if (intent.action === "UNDO" || intent.action === "CANCEL_OPERATION") {
      handleUndo(session, socket);
      return;
    }
    if (intent.action === "REDO") {
      handleRedo(session, socket);
      return;
    }
    if (intent.action === "CLEAR_ALL") {
      send(socket, {
        type: "confirm_clear",
        question: "Clear all items from your draft? Say 'yes' to confirm.",
      } satisfies WSConfirmClearMessage);
      session.sessionState = "confirm_clear_pending";
      return;
    }
    if (intent.action === "QUERY_HISTORY") {
      const { datePhrase, mealLabel, addToDraft } = intent.payload;
      await handleQueryHistory(datePhrase, mealLabel, addToDraft ?? false, session, socket);
      return;
    }
    if (intent.action === "QUERY_REMAINING") {
      await handleQueryRemaining(session, socket);
      return;
    }
    if (intent.action === "LOOKUP_FOOD_INFO") {
      await handleLookupFoodInfo(intent.payload.query, socket);
      return;
    }
    if (intent.action === "SUGGEST_FOODS") {
      await handleSuggestFoods(session, socket);
      return;
    }
    if (intent.action === "SCALE_CONFIRM") {
      // Find the active item (first non-normal or topmost)
      const activeItem = session.draft.find((d) => d.state !== "normal") ?? session.draft[session.draft.length - 1];
      if (activeItem) {
        send(socket, {
          type: "prompt_scale_confirm",
          itemId: activeItem.id,
        } satisfies WSPromptScaleConfirmMessage);
      }
      return;
    }
    if (intent.action === "ESTIMATE_FOOD") {
      const { name, quantity, unit, context: foodContext } = intent.payload;
      await handleEstimateFood(name, quantity, unit, foodContext, session, socket);
      return;
    }
    if (intent.action === "CREATE_FOOD_DIRECTLY") {
      const { name } = intent.payload;
      const tmpId = `direct-${Date.now()}`;
      const timeOfDay = getTimeOfDay();
      const mealLabel = getMealLabel(timeOfDay);
      const creatingItem: DraftItem = {
        id: tmpId,
        name,
        quantity: 1,
        unit: "servings",
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        source: "CUSTOM",
        mealLabel,
        state: "creating",
        creatingProgress: { currentField: "servingSize" },
      };
      session.draft.push(creatingItem);
      session.sessionState = `creating:${tmpId}`;
      session.creatingFoodName = name;
      session.creatingFoodProgress = { currentField: "servingSize" };
      send(socket, {
        type: "create_food_prompt",
        itemId: tmpId,
        foodName: name,
        question: "",
      } satisfies import("../../../shared/types.js").WSCreateFoodPromptMessage);
      send(socket, {
        type: "create_food_field",
        itemId: tmpId,
        foodName: name,
        field: "servingSize",
        question: CREATION_QUESTIONS.servingSize,
        collectedValues: { currentField: "servingSize" },
      } satisfies WSCreateFoodFieldMessage);
      return;
    }
  } catch {
    // Fall through to processTranscript which handles errors
  }

  // Snapshot draft before any modification so UNDO can restore it
  snapshotDraft(session);

  const messages = await processTranscript(context, session.userId);

  for (const msg of messages) {
    // Intercept session_saved — do the real save
    if (msg.type === "session_saved") {
      await saveSession(session, socket);
      return;
    }

    // Apply message to local draft state
    applyMessageToDraft(msg, session);

    // Send to client
    send(socket, msg);
  }
}

// ---------------------------------------------------------------------------
// USDA metrics helper
// ---------------------------------------------------------------------------

function incrementUsdaMetrics(fdcId: number): void {
  prisma.uSDAFoodMetrics.upsert({
    where: { fdcId },
    create: { fdcId, usesCount: 1, lastUsedAt: new Date() },
    update: { usesCount: { increment: 1 }, lastUsedAt: new Date() },
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Awaiting choice transcript handler (keyword match, no Gemini)
// ---------------------------------------------------------------------------

async function handleAwaitingChoiceTranscript(
  text: string,
  session: VoiceSessionState,
  socket: WebSocket,
) {
  const tmpId = (session.sessionState as string).replace("awaiting_choice:", "");
  const lower = text.toLowerCase().trim();

  const wantsCancel = /\b(nevermind|never mind|cancel|cancel that|forget it|go back|stop)\b/.test(lower);
  const wantsCreate = lower.includes("create") || lower.includes("custom") || lower.includes("add it manually");
  const wantsUsda = lower.includes("usda") || lower.includes("database") || lower.includes("search");

  if (wantsCancel) {
    session.draft = session.draft.filter((d) => d.id !== tmpId);
    session.sessionState = "normal";
    session.pendingUsdaItemName = "";
    session.pendingUsdaResult = null;
    send(socket, {
      type: "operation_cancelled",
      itemId: tmpId,
      message: "Cancelled.",
    } satisfies WSOperationCancelledMessage);
    return;
  }

  if (wantsCreate) {
    // Transition to creating flow — capture original quantity from the initial ADD_ITEMS intent
    session.creatingFoodInitialQuantity = session.pendingCreationInitialQuantity;
    session.creatingFoodInitialUnit = session.pendingCreationInitialUnit;
    const timeOfDay = getTimeOfDay();
    const creatingItem: DraftItem = {
      id: tmpId,
      name: session.pendingUsdaItemName,
      quantity: 1,
      unit: "servings",
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      source: "CUSTOM",
      mealLabel: getMealLabel(timeOfDay),
      state: "creating",
      creatingProgress: { currentField: "confirm" },
    };
    // Replace or add the choice card
    const existing = session.draft.find((d) => d.id === tmpId);
    if (existing) {
      Object.assign(existing, creatingItem);
    } else {
      session.draft.push(creatingItem);
    }
    session.sessionState = `creating:${tmpId}`;
    session.creatingFoodName = session.pendingUsdaItemName;
    session.creatingFoodProgress = { currentField: "confirm" };
    session.pendingUsdaResult = null;
    send(socket, {
      type: "create_food_prompt",
      itemId: tmpId,
      foodName: session.pendingUsdaItemName,
      question: `I couldn't find '${session.pendingUsdaItemName}'. Would you like to create it?`,
    } satisfies import("../../../shared/types.js").WSCreateFoodPromptMessage);
    return;
  }

  if (wantsUsda) {
    const usdaResults = await searchFoods(session.pendingUsdaItemName);
    if (usdaResults.length === 0) {
      send(socket, {
        type: "error",
        message: `Couldn't find '${session.pendingUsdaItemName}' in the USDA database either. Say 'create it' to add it manually.`,
      } satisfies WSErrorMessage);
      return;
    }

    // If multiple meaningfully different results, show disambiguation card
    if (shouldDisambiguate(session.pendingUsdaItemName, usdaResults)) {
      const options = usdaResults.slice(0, 3).map((r) => ({ label: r.description, usdaResult: r }));
      session.pendingDisambiguationOptions = options;
      session.pendingDisambiguationName = session.pendingUsdaItemName;
      session.sessionState = `disambiguating:${tmpId}`;
      // Update the food_choice card to disambiguate state
      const existing = session.draft.find((d) => d.id === tmpId);
      if (existing) {
        existing.state = "disambiguate";
        (existing as DraftItem & { disambiguationOptions?: unknown }).disambiguationOptions = options;
      }
      send(socket, {
        type: "disambiguate",
        itemId: tmpId,
        foodName: session.pendingUsdaItemName,
        question: `Which '${session.pendingUsdaItemName}' did you mean?`,
        options,
      } satisfies WSDisambiguateMessage);
      return;
    }

    // Single clear result — check suppressUsdaWarning preference
    const best = usdaResults[0];
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { suppressUsdaWarning: true },
    });

    if (user?.suppressUsdaWarning) {
      // Auto-add without confirmation
      incrementUsdaMetrics(best.fdcId);
      const servingSize = best.servingSize ?? 100;
      const macros = {
        calories: Math.round(best.macros.calories),
        proteinG: Math.round(best.macros.proteinG * 10) / 10,
        carbsG: Math.round(best.macros.carbsG * 10) / 10,
        fatG: Math.round(best.macros.fatG * 10) / 10,
      };
      const item: DraftItem = {
        id: tmpId,
        name: best.description,
        quantity: 1,
        unit: best.servingSizeUnit ?? "g",
        ...macros,
        source: "DATABASE",
        usdaFdcId: best.fdcId,
        mealLabel: getMealLabel(getTimeOfDay()),
        state: "normal",
        isAssumed: true,
      };
      const existing = session.draft.find((d) => d.id === tmpId);
      if (existing) {
        Object.assign(existing, item);
      } else {
        session.draft.push(item);
      }
      session.sessionState = "normal";
      session.pendingUsdaResult = null;
      session.pendingUsdaItemName = "";
      send(socket, {
        type: "items_added",
        items: [item],
      } satisfies WSItemsAddedMessage);
    } else {
      // Prompt confirmation
      session.pendingUsdaResult = best;
      session.sessionState = `usda_pending:${tmpId}`;
      send(socket, {
        type: "usda_confirm",
        itemId: tmpId,
        usdaDescription: best.description,
        question: `Found '${best.description}' in USDA. Note: USDA data quality may vary. Say 'confirm' to add, or 'cancel' to go back.`,
        usdaResult: best,
      } satisfies WSUsdaConfirmMessage);
    }
    return;
  }

  // Unrecognized — re-prompt
  send(socket, {
    type: "food_choice",
    itemId: tmpId,
    foodName: session.pendingUsdaItemName,
    question: `Say 'create it' to add '${session.pendingUsdaItemName}' manually, or 'try USDA' to search the database.`,
  } satisfies WSFoodChoiceMessage);
}

// ---------------------------------------------------------------------------
// USDA pending confirmation handler
// ---------------------------------------------------------------------------

async function handleUsdaPendingTranscript(
  text: string,
  session: VoiceSessionState,
  socket: WebSocket,
) {
  const tmpId = (session.sessionState as string).replace("usda_pending:", "");
  const lower = text.toLowerCase().trim();

  const confirmed = lower.includes("confirm") || lower.includes("yes") || lower.includes("add");
  const cancelled =
    lower.includes("cancel") ||
    lower.includes("no") ||
    lower.includes("back") ||
    lower.includes("nevermind") ||
    lower.includes("never mind") ||
    lower.includes("forget it") ||
    lower.includes("stop");

  if (confirmed && session.pendingUsdaResult) {
    incrementUsdaMetrics(session.pendingUsdaResult.fdcId);
    const usdaResult = await lookupItemInUsda(
      session.pendingUsdaItemName,
      undefined,
      undefined,
      getMealLabel(getTimeOfDay()),
    );
    if (usdaResult.found) {
      const item = { ...usdaResult.draft, id: tmpId };
      const existing = session.draft.find((d) => d.id === tmpId);
      if (existing) {
        Object.assign(existing, item);
      } else {
        session.draft.push(item);
      }
      session.sessionState = "normal";
      session.pendingUsdaResult = null;
      session.pendingUsdaItemName = "";
      send(socket, {
        type: "items_added",
        items: [item],
      } satisfies WSItemsAddedMessage);
    } else {
      send(socket, {
        type: "error",
        message: "Could not retrieve the USDA item. Please try again.",
      } satisfies WSErrorMessage);
    }
    return;
  }

  if (cancelled) {
    session.sessionState = `awaiting_choice:${tmpId}`;
    send(socket, {
      type: "food_choice",
      itemId: tmpId,
      foodName: session.pendingUsdaItemName,
      question: `Say 'create it' to add '${session.pendingUsdaItemName}' manually, or 'try USDA' to search the database.`,
    } satisfies WSFoodChoiceMessage);
    return;
  }

  // Unrecognized — re-prompt
  if (session.pendingUsdaResult) {
    send(socket, {
      type: "usda_confirm",
      itemId: tmpId,
      usdaDescription: session.pendingUsdaResult.description,
      question: `Say 'confirm' to add '${session.pendingUsdaResult.description}', or 'cancel' to go back.`,
      usdaResult: session.pendingUsdaResult,
    } satisfies WSUsdaConfirmMessage);
  }
}

// ---------------------------------------------------------------------------
// Phase 2 — Disambiguation handler (keyword matching, no Gemini call)
// ---------------------------------------------------------------------------

async function handleDisambiguatingTranscript(
  text: string,
  session: VoiceSessionState,
  socket: WebSocket,
) {
  const tmpId = (session.sessionState as string).replace("disambiguating:", "");
  const lower = text.toLowerCase().trim();

  const wantsCancel = /\b(nevermind|never mind|cancel|cancel that|forget it|go back|stop)\b/.test(lower);
  if (wantsCancel) {
    session.draft = session.draft.filter((d) => d.id !== tmpId);
    session.sessionState = "normal";
    session.pendingDisambiguationOptions = [];
    session.pendingDisambiguationName = "";
    send(socket, {
      type: "operation_cancelled",
      itemId: tmpId,
      message: "Cancelled.",
    } satisfies WSOperationCancelledMessage);
    return;
  }

  const options = session.pendingDisambiguationOptions;
  if (options.length === 0) {
    session.sessionState = "normal";
    return;
  }

  // Try number match first
  const numMap: Record<string, number> = { "1": 0, "one": 0, "first": 0, "2": 1, "two": 1, "second": 1, "3": 2, "three": 2, "third": 2 };
  let chosenOption: DisambiguationOption | null = null;

  for (const [word, idx] of Object.entries(numMap)) {
    if (lower.includes(word) && idx < options.length) {
      chosenOption = options[idx];
      break;
    }
  }

  // Try keyword match against option labels
  if (!chosenOption) {
    for (const opt of options) {
      if (lower.includes(opt.label.toLowerCase().split(",")[0].trim())) {
        chosenOption = opt;
        break;
      }
    }
  }

  // Fuzzy keyword match — check if any word in the transcript appears in an option label
  if (!chosenOption) {
    const words = lower.split(/\s+/);
    for (const opt of options) {
      const optLower = opt.label.toLowerCase();
      if (words.some((w) => w.length > 3 && optLower.includes(w))) {
        chosenOption = opt;
        break;
      }
    }
  }

  if (!chosenOption) {
    // Re-prompt
    const optionLabels = options.map((o, i) => `${i + 1}. ${o.label}`).join(", ");
    send(socket, {
      type: "disambiguate",
      itemId: tmpId,
      foodName: session.pendingDisambiguationName,
      question: `Which one? ${optionLabels}`,
      options,
    } satisfies WSDisambiguateMessage);
    return;
  }

  // Build draft item from chosen USDA result
  const best = chosenOption.usdaResult;
  const servingSize = best.servingSize ?? 100;
  const qty = 1;
  const unit = best.servingSizeUnit ?? "g";
  const ratio = 1; // 1 serving
  const macros = {
    calories: Math.round(best.macros.calories * ratio),
    proteinG: Math.round(best.macros.proteinG * ratio * 10) / 10,
    carbsG: Math.round(best.macros.carbsG * ratio * 10) / 10,
    fatG: Math.round(best.macros.fatG * ratio * 10) / 10,
  };

  const item: DraftItem = {
    id: tmpId,
    name: best.description,
    quantity: qty,
    unit,
    ...macros,
    source: "DATABASE",
    usdaFdcId: best.fdcId,
    mealLabel: getMealLabel(getTimeOfDay()),
    state: "normal",
    isAssumed: true,
  };

  // Replace or add the item
  const existing = session.draft.find((d) => d.id === tmpId);
  if (existing) {
    Object.assign(existing, item);
  } else {
    session.draft.push(item);
  }

  session.sessionState = "normal";
  session.pendingDisambiguationOptions = [];
  session.pendingDisambiguationName = "";

  // Increment USDA metrics fire-and-forget
  incrementUsdaMetrics(best.fdcId);

  send(socket, {
    type: "items_added",
    items: [item],
  } satisfies WSItemsAddedMessage);
  send(socket, {
    type: "ask",
    question: `Added ${best.description} — ${qty} ${unit}. Say 'make that N' to adjust the amount.`,
  } satisfies WSAskMessage);
}

// ---------------------------------------------------------------------------
// Phase 3 — Confirm clear handler
// ---------------------------------------------------------------------------

async function handleConfirmClearTranscript(
  text: string,
  session: VoiceSessionState,
  socket: WebSocket,
) {
  const lower = text.toLowerCase().trim();
  const isYes = /\b(yes|yeah|sure|go ahead|yep|ok|okay|clear|confirm)\b/.test(lower);
  const isNo = /\b(no|nope|cancel|stop|nevermind|never mind|forget it)\b/.test(lower);

  if (isYes) {
    snapshotDraft(session);
    session.draft = [];
    session.sessionState = "normal";
    send(socket, {
      type: "draft_replaced",
      draft: [],
      message: "All items cleared.",
    } satisfies WSDraftReplacedMessage);
    return;
  }

  if (isNo) {
    session.sessionState = "normal";
    send(socket, { type: "ask", question: "OK, keeping everything." } satisfies WSAskMessage);
    return;
  }

  // Re-prompt
  send(socket, {
    type: "confirm_clear",
    question: "Say 'yes' to clear all items, or 'cancel' to keep them.",
  } satisfies WSConfirmClearMessage);
}

// ---------------------------------------------------------------------------
// Confirming handler — nutrition collected, awaiting save/community/cancel
// ---------------------------------------------------------------------------

async function handleConfirmingTranscript(
  text: string,
  session: VoiceSessionState,
  socket: WebSocket,
) {
  const tmpId = (session.sessionState as string).replace("confirming:", "");
  const progress = session.creatingFoodProgress!;
  const foodName = session.creatingFoodName;

  const context: GeminiRequestContext = {
    transcript: text,
    currentDraft: draftContext(session.draft),
    timeOfDay: getTimeOfDay(),
    date: session.date,
    sessionState: session.sessionState as GeminiRequestContext["sessionState"],
    creatingFoodProgress: progress,
  };

  let intent;
  try {
    intent = await parseTranscript(context);
  } catch {
    send(socket, {
      type: "error",
      message: "I didn't catch that, could you say it again?",
    } satisfies WSErrorMessage);
    return;
  }

  if (intent.action === "CANCEL_OPERATION") {
    session.draft = session.draft.filter((d) => d.id !== tmpId);
    session.sessionState = "normal";
    session.creatingFoodName = "";
    session.creatingFoodProgress = null;
    session.creatingFoodInitialQuantity = null;
    session.creatingFoodInitialUnit = null;
    send(socket, {
      type: "operation_cancelled",
      itemId: tmpId,
      message: `Cancelled. ${foodName} won't be added.`,
    } satisfies WSOperationCancelledMessage);
    return;
  }

  if (intent.action !== "CONFIRM_FOOD_CREATION") {
    // Re-prompt with the confirmation card
    const quantityMismatch = !!session.creatingFoodInitialUnit
      && session.creatingFoodInitialUnit !== (progress.servingUnit ?? "servings");
    send(socket, {
      type: "create_food_confirm",
      itemId: tmpId,
      foodName,
      collectedValues: { ...progress },
      initialQuantity: session.creatingFoodInitialQuantity ?? undefined,
      initialUnit: session.creatingFoodInitialUnit ?? undefined,
      quantityMismatch,
    } satisfies WSCreateFoodConfirmMessage);
    return;
  }

  const { saveMode, quantity, unit } = (intent as GeminiConfirmFoodCreationIntent).payload;

  if (saveMode === "cancel") {
    session.draft = session.draft.filter((d) => d.id !== tmpId);
    session.sessionState = "normal";
    session.creatingFoodName = "";
    session.creatingFoodProgress = null;
    session.creatingFoodInitialQuantity = null;
    session.creatingFoodInitialUnit = null;
    send(socket, {
      type: "operation_cancelled",
      itemId: tmpId,
      message: `Cancelled. ${foodName} won't be added.`,
    } satisfies WSOperationCancelledMessage);
    return;
  }

  try {
    const created = await prisma.customFood.create({
      data: {
        userId: session.userId,
        name: foodName,
        brandName: progress.brand || null,
        servingSize: progress.servingSize ?? 1,
        servingUnit: progress.servingUnit ?? "servings",
        calories: progress.calories ?? 0,
        proteinG: progress.proteinG ?? 0,
        carbsG: progress.carbsG ?? 0,
        fatG: progress.fatG ?? 0,
        barcode: normalizeBarcode(progress.barcode || session.pendingBarcodeGtin || "") || null,
      },
    });

    if (session.pendingBarcodeGtin) session.pendingBarcodeGtin = "";
    session.customFoodsCreatedThisSession.push(created.id);

    const finalQty = quantity ?? session.creatingFoodInitialQuantity ?? 1;
    const finalUnit = unit ?? session.creatingFoodInitialUnit ?? progress.servingUnit ?? "servings";
    const ratio = (progress.servingSize ?? 1) > 0 ? finalQty / (progress.servingSize ?? 1) : 1;

    const itemIdx = session.draft.findIndex((d) => d.id === tmpId);
    const baseItem = itemIdx !== -1 ? session.draft[itemIdx] : null;
    const completedItem: DraftItem = {
      id: tmpId,
      name: foodName,
      quantity: finalQty,
      unit: finalUnit,
      calories: Math.round((progress.calories ?? 0) * ratio),
      proteinG: Math.round((progress.proteinG ?? 0) * ratio * 10) / 10,
      carbsG: Math.round((progress.carbsG ?? 0) * ratio * 10) / 10,
      fatG: Math.round((progress.fatG ?? 0) * ratio * 10) / 10,
      source: "CUSTOM",
      customFoodId: created.id,
      mealLabel: baseItem?.mealLabel ?? getMealLabel(getTimeOfDay()),
      state: "normal",
    };

    if (itemIdx !== -1) {
      session.draft[itemIdx] = completedItem;
    } else {
      session.draft.push(completedItem);
    }

    session.sessionState = "normal";
    session.creatingFoodProgress = null;
    session.creatingFoodName = "";
    session.creatingFoodInitialQuantity = null;
    session.creatingFoodInitialUnit = null;

    send(socket, {
      type: "create_food_complete",
      item: completedItem,
    } satisfies WSCreateFoodCompleteMessage);

    if (saveMode === "community") {
      prisma.communityFood.create({
        data: {
          name: created.name,
          brandName: created.brandName ?? undefined,
          defaultServingSize: created.servingSize,
          defaultServingUnit: created.servingUnit,
          calories: created.calories,
          proteinG: created.proteinG,
          carbsG: created.carbsG,
          fatG: created.fatG,
          createdByUserId: session.userId,
          status: "PENDING",
        },
      }).catch((err: unknown) => {
        console.error("[voiceSession] Community submit failed:", err);
      });
      send(socket, {
        type: "ask",
        question: `Saved and shared ${foodName} with the community.`,
      } satisfies WSAskMessage);
    } else {
      send(socket, {
        type: "ask",
        question: `Saved ${foodName} privately.`,
      } satisfies WSAskMessage);
    }
  } catch (err) {
    console.error("[voiceSession] Failed to create custom food:", err);
    send(socket, {
      type: "error",
      message: "Failed to save the custom food. Please try again.",
    } satisfies WSErrorMessage);
  }
}

// ---------------------------------------------------------------------------
// Phase 4 — History date resolver
// ---------------------------------------------------------------------------

function resolveDatePhrase(phrase: string, referenceDate: string): string {
  const ref = new Date(referenceDate + "T12:00:00");
  const lower = phrase.toLowerCase().trim();

  if (lower === "yesterday") {
    ref.setDate(ref.getDate() - 1);
    return ref.toISOString().split("T")[0];
  }
  if (lower === "today") {
    return referenceDate;
  }

  // "N days ago"
  const daysAgo = lower.match(/(\d+)\s+days?\s+ago/);
  if (daysAgo) {
    ref.setDate(ref.getDate() - Number(daysAgo[1]));
    return ref.toISOString().split("T")[0];
  }

  // "last Monday / Tuesday / ..."
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const lastDayMatch = lower.match(/last\s+(\w+)/);
  if (lastDayMatch) {
    const targetDay = dayNames.indexOf(lastDayMatch[1]);
    if (targetDay !== -1) {
      const currentDay = ref.getDay();
      let daysBack = currentDay - targetDay;
      if (daysBack <= 0) daysBack += 7;
      ref.setDate(ref.getDate() - daysBack);
      return ref.toISOString().split("T")[0];
    }
  }

  // Fall back to referenceDate if we can't resolve
  return referenceDate;
}

// ---------------------------------------------------------------------------
// Phase 4 — Query history handler
// ---------------------------------------------------------------------------

async function handleQueryHistory(
  datePhrase: string,
  mealLabel: MealLabel | undefined,
  addToDraft: boolean,
  session: VoiceSessionState,
  socket: WebSocket,
) {
  const targetDate = resolveDatePhrase(datePhrase, session.date);
  const tmpId = `history-${Date.now()}`;

  const entries = await prisma.foodEntry.findMany({
    where: {
      userId: session.userId,
      date: new Date(targetDate + "T12:00:00"),
      ...(mealLabel ? { mealLabel } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      name: true,
      quantity: true,
      unit: true,
      calories: true,
      proteinG: true,
      carbsG: true,
      fatG: true,
      mealLabel: true,
    },
  });

  const historyEntries: HistoryFoodEntry[] = entries.map((e) => ({
    name: e.name,
    quantity: e.quantity,
    unit: e.unit,
    macros: { calories: e.calories, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG },
  }));

  const totals: Macros = historyEntries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.macros.calories,
      proteinG: acc.proteinG + e.macros.proteinG,
      carbsG: acc.carbsG + e.macros.carbsG,
      fatG: acc.fatG + e.macros.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const dateLabel = datePhrase === "yesterday" ? "Yesterday" : targetDate;

  if (addToDraft && historyEntries.length > 0) {
    // Add entries as normal draft items
    const now = getTimeOfDay();
    const meal = getMealLabel(now);
    const newItems: DraftItem[] = historyEntries.map((e, i) => ({
      id: `history-item-${Date.now()}-${i}`,
      name: e.name,
      quantity: e.quantity,
      unit: e.unit,
      ...e.macros,
      source: "DATABASE" as const,
      mealLabel: meal,
      state: "normal" as const,
    }));
    session.draft.push(...newItems);
    send(socket, {
      type: "items_added",
      items: newItems,
    } satisfies WSItemsAddedMessage);
  }

  send(socket, {
    type: "history_results",
    itemId: tmpId,
    dateLabel,
    mealLabel,
    entries: historyEntries,
    totals,
    addedToDraft: addToDraft && historyEntries.length > 0,
  } satisfies WSHistoryResultsMessage);
}

// ---------------------------------------------------------------------------
// Phase 5 — Query remaining macros handler
// ---------------------------------------------------------------------------

async function handleQueryRemaining(session: VoiceSessionState, socket: WebSocket) {
  const tmpId = `macro-summary-${Date.now()}`;

  // Fetch today's goal
  const goalTimeline = await prisma.goalTimeline.findFirst({
    where: {
      userId: session.userId,
      effectiveDate: { lte: new Date(session.date + "T23:59:59") },
    },
    orderBy: { effectiveDate: "desc" },
    select: { calories: true, proteinG: true, carbsG: true, fatG: true },
  });

  const goals: Macros | null = goalTimeline
    ? { calories: goalTimeline.calories, proteinG: goalTimeline.proteinG, carbsG: goalTimeline.carbsG, fatG: goalTimeline.fatG }
    : null;

  // Fetch already-saved totals for today
  const savedEntries = await prisma.foodEntry.findMany({
    where: {
      userId: session.userId,
      date: new Date(session.date + "T12:00:00"),
    },
    select: { calories: true, proteinG: true, carbsG: true, fatG: true },
  });

  const savedTotals = savedEntries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      proteinG: acc.proteinG + e.proteinG,
      carbsG: acc.carbsG + e.carbsG,
      fatG: acc.fatG + e.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  // Add draft totals
  const draftNormal = session.draft.filter((d) => d.state === "normal");
  const draftTotals = draftNormal.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      proteinG: acc.proteinG + e.proteinG,
      carbsG: acc.carbsG + e.carbsG,
      fatG: acc.fatG + e.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const combinedCalories = savedTotals.calories + draftTotals.calories;
  const combinedProtein = savedTotals.proteinG + draftTotals.proteinG;
  const combinedCarbs = savedTotals.carbsG + draftTotals.carbsG;
  const combinedFat = savedTotals.fatG + draftTotals.fatG;

  send(socket, {
    type: "macro_summary",
    itemId: tmpId,
    summary: {
      calories: combinedCalories,
      proteinG: combinedProtein,
      carbsG: combinedCarbs,
      fatG: combinedFat,
      goals,
    },
  } satisfies WSMacroSummaryMessage);
}

// ---------------------------------------------------------------------------
// Phase 5 — Lookup food info handler
// ---------------------------------------------------------------------------

async function handleLookupFoodInfo(query: string, socket: WebSocket) {
  const tmpId = `food-info-${Date.now()}`;
  const result = await lookupFoodInfoOnly(query);

  if (!result.found) {
    send(socket, {
      type: "ask",
      question: `I couldn't find nutrition info for '${query}' in the database.`,
    } satisfies WSAskMessage);
    return;
  }

  send(socket, {
    type: "food_info",
    itemId: tmpId,
    foodName: query,
    usdaResult: result.usdaResult,
  } satisfies WSFoodInfoMessage);
}

// ---------------------------------------------------------------------------
// Phase 5 — Suggest foods handler
// ---------------------------------------------------------------------------

async function handleSuggestFoods(session: VoiceSessionState, socket: WebSocket) {
  const tmpId = `food-suggestions-${Date.now()}`;

  // Fetch remaining macros
  const goalTimeline = await prisma.goalTimeline.findFirst({
    where: {
      userId: session.userId,
      effectiveDate: { lte: new Date(session.date + "T23:59:59") },
    },
    orderBy: { effectiveDate: "desc" },
    select: { calories: true, proteinG: true, carbsG: true, fatG: true },
  });

  const goals: Macros | null = goalTimeline
    ? { calories: goalTimeline.calories, proteinG: goalTimeline.proteinG, carbsG: goalTimeline.carbsG, fatG: goalTimeline.fatG }
    : null;

  if (!goals) {
    send(socket, {
      type: "ask",
      question: "Set your daily goals first to get food suggestions.",
    } satisfies WSAskMessage);
    return;
  }

  const savedEntries = await prisma.foodEntry.findMany({
    where: { userId: session.userId, date: new Date(session.date + "T12:00:00") },
    select: { calories: true, proteinG: true, carbsG: true, fatG: true },
  });

  const consumed = savedEntries.reduce(
    (acc, e) => ({ calories: acc.calories + e.calories, proteinG: acc.proteinG + e.proteinG, carbsG: acc.carbsG + e.carbsG, fatG: acc.fatG + e.fatG }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  // Add draft
  const draftNormal = session.draft.filter((d) => d.state === "normal");
  draftNormal.forEach((d) => {
    consumed.calories += d.calories;
    consumed.proteinG += d.proteinG;
    consumed.carbsG += d.carbsG;
    consumed.fatG += d.fatG;
  });

  const remaining: Macros = {
    calories: Math.max(0, goals.calories - consumed.calories),
    proteinG: Math.max(0, goals.proteinG - consumed.proteinG),
    carbsG: Math.max(0, goals.carbsG - consumed.carbsG),
    fatG: Math.max(0, goals.fatG - consumed.fatG),
  };

  // Find USDA candidates based on highest remaining macro
  const searchQuery = remaining.proteinG > 20 ? "high protein" : remaining.carbsG > 30 ? "complex carbs" : "healthy food";
  const candidates = await searchFoods(searchQuery);

  let suggestions: Array<{ name: string; macros: Macros; reason: string }> = [];
  try {
    suggestions = await suggestFoodsFromCandidates(remaining, candidates);
  } catch (err) {
    console.error("[voiceSession] suggestFoodsFromCandidates failed:", err);
    suggestions = candidates.slice(0, 3).map((c) => ({
      name: c.description,
      macros: c.macros,
      reason: "Matches your remaining macro budget.",
    }));
  }

  send(socket, {
    type: "food_suggestions",
    itemId: tmpId,
    suggestions,
  } satisfies WSFoodSuggestionsMessage);
}

// ---------------------------------------------------------------------------
// Phase 6 — Estimate food handler
// ---------------------------------------------------------------------------

async function handleEstimateFood(
  name: string,
  qty: number | undefined,
  unit: string | undefined,
  context: string | undefined,
  session: VoiceSessionState,
  socket: WebSocket,
) {
  const tmpId = `estimate-${Date.now()}`;
  const timeOfDay = getTimeOfDay();
  const mealLabel = getMealLabel(timeOfDay);

  let estimate: Awaited<ReturnType<typeof estimateFood>>;
  try {
    estimate = await estimateFood(name, qty, unit, context);
  } catch (err) {
    console.error("[voiceSession] estimateFood failed:", err);
    send(socket, {
      type: "error",
      message: "Could not estimate nutrition for that food. Try searching manually.",
    } satisfies WSErrorMessage);
    return;
  }

  if (!estimate.estimatable) {
    send(socket, {
      type: "ask",
      question: `I can't reliably estimate nutrition for '${name}'. Try saying 'create it' to add it manually.`,
    } satisfies WSAskMessage);
    return;
  }

  const servingQty = qty ?? estimate.servingSize;
  const servingUnit = unit ?? estimate.servingUnit;
  // Scale macros to requested qty
  const ratio = estimate.servingSize > 0 ? servingQty / estimate.servingSize : 1;

  const item: DraftItem = {
    id: tmpId,
    name: estimate.name,
    quantity: servingQty,
    unit: servingUnit,
    calories: Math.round(estimate.calories * ratio),
    proteinG: Math.round(estimate.proteinG * ratio * 10) / 10,
    carbsG: Math.round(estimate.carbsG * ratio * 10) / 10,
    fatG: Math.round(estimate.fatG * ratio * 10) / 10,
    source: "AI_ESTIMATE",
    mealLabel,
    state: "estimate_card",
    isEstimate: true,
    estimateConfidence: estimate.confidence,
  };

  session.draft.push(item);
  session.sessionState = `estimate_pending:${tmpId}`;

  send(socket, {
    type: "estimate_card",
    item,
    canAddAnyway: true,
  } satisfies WSEstimateCardMessage);
}

// ---------------------------------------------------------------------------
// Phase 6 — Estimate pending handler (add anyway / search DB response)
// ---------------------------------------------------------------------------

async function handleEstimatePendingTranscript(
  text: string,
  session: VoiceSessionState,
  socket: WebSocket,
) {
  const tmpId = (session.sessionState as string).replace("estimate_pending:", "");
  const lower = text.toLowerCase().trim();

  const wantsAdd = /\b(add|yes|ok|okay|add anyway|add it|sure|yep|yeah)\b/.test(lower);
  const wantsSearch = /\b(search|search db|look it up|find it|usda|database)\b/.test(lower);
  const wantsCancel = /\b(cancel|no|nevermind|never mind|forget it|stop)\b/.test(lower);

  if (wantsAdd) {
    const item = session.draft.find((d) => d.id === tmpId);
    if (item) {
      item.state = "normal";
      send(socket, {
        type: "items_added",
        items: [{ ...item, state: "normal" }],
      } satisfies WSItemsAddedMessage);
      send(socket, {
        type: "ask",
        question: `Added ${item.name} (AI estimate, ${item.estimateConfidence ?? "medium"} confidence).`,
      } satisfies WSAskMessage);
    }
    session.sessionState = "normal";
    return;
  }

  if (wantsSearch) {
    const item = session.draft.find((d) => d.id === tmpId);
    const searchName = item?.name ?? "";
    // Remove the estimate card, transition to lookup
    session.draft = session.draft.filter((d) => d.id !== tmpId);
    session.sessionState = "normal";
    await handleLookupFoodInfo(searchName, socket);
    return;
  }

  if (wantsCancel) {
    session.draft = session.draft.filter((d) => d.id !== tmpId);
    session.sessionState = "normal";
    send(socket, {
      type: "operation_cancelled",
      itemId: tmpId,
      message: "Estimate discarded.",
    } satisfies WSOperationCancelledMessage);
    return;
  }

  // Re-prompt
  const item = session.draft.find((d) => d.id === tmpId);
  if (item) {
    send(socket, {
      type: "ask",
      question: `Say 'add' to log the estimate, 'search DB' to look it up, or 'cancel' to discard.`,
    } satisfies WSAskMessage);
  }
}

// ---------------------------------------------------------------------------
// Barcode scan handlers
// ---------------------------------------------------------------------------

async function handleBarcodeScan(
  gtin: string,
  session: VoiceSessionState,
  socket: WebSocket,
) {
  const normalizedGtin = normalizeBarcode(gtin);
  if (!normalizedGtin) return;

  if (session.sessionState !== "normal") return;

  const record = await prisma.communityFoodBarcode.findUnique({
    where: { barcode: normalizedGtin },
    include: { communityFood: true },
  });

  if (record?.communityFood) {
    const food = record.communityFood;
    const item: DraftItem = {
      id: `barcode-${Date.now()}`,
      name: food.name,
      quantity: 1,
      unit: food.defaultServingUnit ?? "serving",
      calories: food.calories,
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatG: food.fatG,
      source: "COMMUNITY",
      communityFoodId: food.id,
      mealLabel: getMealLabel(getTimeOfDay()),
      state: "normal",
    };
    session.draft.push(item);
    send(socket, { type: "items_added", items: [item] } satisfies WSItemsAddedMessage);
    send(socket, { type: "ask", question: `Added ${food.name}.` } satisfies WSAskMessage);
  } else {
    // Check if the user has a custom food with this barcode
    const customFood = await prisma.customFood.findFirst({
      where: { userId: session.userId, barcode: normalizedGtin },
    });
    if (customFood) {
      const item: DraftItem = {
        id: `barcode-${Date.now()}`,
        name: customFood.name,
        quantity: customFood.servingSize,
        unit: customFood.servingUnit,
        calories: customFood.calories,
        proteinG: customFood.proteinG,
        carbsG: customFood.carbsG,
        fatG: customFood.fatG,
        source: "CUSTOM",
        customFoodId: customFood.id,
        mealLabel: getMealLabel(getTimeOfDay()),
        state: "normal",
      };
      session.draft.push(item);
      send(socket, { type: "items_added", items: [item] } satisfies WSItemsAddedMessage);
      send(socket, { type: "ask", question: `Added ${customFood.name}.` } satisfies WSAskMessage);
    } else {
      session.sessionState = `barcode_pending:${normalizedGtin}`;
      session.pendingBarcodeGtin = normalizedGtin;
      send(socket, {
        type: "ask",
        question: "I couldn't find that product. Want me to create a custom food?",
      } satisfies WSAskMessage);
    }
  }
}

async function handleBarcodePendingTranscript(
  text: string,
  session: VoiceSessionState,
  socket: WebSocket,
) {
  const gtin = (session.sessionState as string).replace("barcode_pending:", "");
  const isYes = /\b(yes|yeah|sure|create|add|ok|yep|yup)\b/i.test(text);
  const isNo = /\b(no|nope|cancel|skip|stop)\b/i.test(text);

  if (isYes) {
    session.sessionState = `barcode_naming:${gtin}`;
    send(socket, {
      type: "ask",
      question: "What would you like to call this food?",
    } satisfies WSAskMessage);
  } else if (isNo) {
    session.sessionState = "normal";
    session.pendingBarcodeGtin = "";
    send(socket, { type: "ask", question: "OK, back to logging." } satisfies WSAskMessage);
  } else {
    send(socket, {
      type: "ask",
      question: "I couldn't find that product. Want me to create a custom food?",
    } satisfies WSAskMessage);
  }
}

async function handleBarcodeNamingTranscript(
  text: string,
  session: VoiceSessionState,
  socket: WebSocket,
) {
  const gtin = (session.sessionState as string).replace("barcode_naming:", "");
  const foodName = text.trim();
  const tmpId = `barcode-${Date.now()}`;

  const creatingItem: DraftItem = {
    id: tmpId,
    name: foodName,
    quantity: 1,
    unit: "servings",
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    source: "CUSTOM",
    mealLabel: getMealLabel(getTimeOfDay()),
    state: "creating",
    creatingProgress: { currentField: "servingSize" },
  };

  session.draft.push(creatingItem);
  session.sessionState = `creating:${tmpId}`;
  session.creatingFoodName = foodName;
  session.creatingFoodProgress = { currentField: "servingSize" };
  session.pendingBarcodeGtin = gtin;

  // Empty question so client doesn't speak twice; card is created silently
  send(socket, {
    type: "create_food_prompt",
    itemId: tmpId,
    foodName,
    question: "",
  } satisfies import("../../../shared/types.js").WSCreateFoodPromptMessage);
  // This updates the card's currentField to servingSize AND speaks the question
  send(socket, {
    type: "create_food_field",
    itemId: tmpId,
    foodName,
    field: "servingSize",
    question: CREATION_QUESTIONS.servingSize,
    collectedValues: { currentField: "servingSize" },
  } satisfies WSCreateFoodFieldMessage);
}

function applyMessageToDraft(
  msg: WSServerMessage,
  session: VoiceSessionState,
) {
  if (msg.type === "items_added") {
    session.draft.push(...msg.items);
  } else if (msg.type === "item_edited") {
    const item = session.draft.find((d) => d.id === msg.itemId);
    if (item) Object.assign(item, msg.changes);
  } else if (msg.type === "item_removed") {
    session.draft = session.draft.filter((d) => d.id !== msg.itemId);
  } else if (msg.type === "clarify") {
    const item = session.draft.find((d) => d.id === msg.itemId);
    if (item) {
      item.state = "clarifying";
      item.clarifyQuestion = msg.question;
    }
  } else if (msg.type === "create_food_prompt") {
    // Only handle one creation at a time
    if (session.sessionState !== "normal") return;

    const timeOfDay = getTimeOfDay();
    const creatingItem: DraftItem = {
      id: msg.itemId,
      name: msg.foodName,
      quantity: 1,
      unit: "servings",
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      source: "CUSTOM",
      mealLabel: getMealLabel(timeOfDay),
      state: "creating",
      creatingProgress: { currentField: "confirm" },
    };
    session.draft.push(creatingItem);
    session.sessionState = `creating:${msg.itemId}`;
    session.creatingFoodName = msg.foodName;
    session.creatingFoodProgress = { currentField: "confirm" };
  } else if (msg.type === "food_choice") {
    // Only handle one choice at a time
    if (session.sessionState !== "normal") return;

    const timeOfDay = getTimeOfDay();
    const choiceItem: DraftItem = {
      id: msg.itemId,
      name: msg.foodName,
      quantity: 1,
      unit: "servings",
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      source: "CUSTOM",
      mealLabel: getMealLabel(timeOfDay),
      state: "choice",
    };
    session.draft.push(choiceItem);
    session.sessionState = `awaiting_choice:${msg.itemId}`;
    session.pendingUsdaItemName = msg.foodName;
    // Capture initial quantity from the parsed ADD_ITEMS intent for this food
    const intentItem = session.pendingIntentItems?.find(
      (i) => i.name.toLowerCase() === msg.foodName.toLowerCase(),
    );
    session.pendingCreationInitialQuantity = intentItem?.quantity ?? null;
    session.pendingCreationInitialUnit = intentItem?.unit ?? null;
  } else if (msg.type === "disambiguate") {
    // Only handle one disambiguation at a time
    if (session.sessionState !== "normal") return;

    const timeOfDay = getTimeOfDay();
    const disambiguateItem: DraftItem = {
      id: msg.itemId,
      name: msg.foodName,
      quantity: 1,
      unit: "servings",
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      source: "DATABASE",
      mealLabel: getMealLabel(timeOfDay),
      state: "disambiguate",
      disambiguationOptions: msg.options,
    };
    session.draft.push(disambiguateItem);
    session.sessionState = `disambiguating:${msg.itemId}`;
    session.pendingDisambiguationOptions = msg.options;
    session.pendingDisambiguationName = msg.foodName;
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function voiceSessionRoutes(app: FastifyInstance) {
  app.get(
    "/ws/voice-session",
    { websocket: true },
    async (socket: WebSocket, request: FastifyRequest) => {
      const userId = await getDefaultUserId();
      const query = request.query as Record<string, string>;
      const today = new Date().toISOString().split("T")[0];
      const date = query.date ?? today;
      const sttMode =
        (query.sttMode as "local" | "cloud" | undefined) ??
        (process.env.VOICE_STT_MODE as "local" | "cloud" | undefined) ??
        "local";
      const useCloudStt = sttMode === "cloud";

      const session: VoiceSessionState = {
        userId,
        date,
        draft: [],
        sessionState: "normal",
        creatingFoodName: "",
        creatingFoodProgress: null,
        creatingFoodInitialQuantity: null,
        creatingFoodInitialUnit: null,
        customFoodsCreatedThisSession: [],
        completed: false,
        pendingUsdaResult: null,
        pendingUsdaItemName: "",
        pendingBarcodeGtin: "",
        pendingDisambiguationOptions: [],
        pendingDisambiguationName: "",
        pendingIntentItems: null,
        pendingCreationInitialQuantity: null,
        pendingCreationInitialUnit: null,
        draftHistory: [],
        redoStack: [],
      };

      console.log(`[voiceSession] Connected — date: ${date}`);

      let cloudStt: CloudSttSession | null = null;
      if (useCloudStt) {
        cloudStt = createCloudSttSession({
          onTranscript: async (text) => {
            // Route cloud transcripts through the same handlers as client
            // transcripts so the downstream behavior is identical.
            try {
              if (session.sessionState.startsWith("creating:")) {
                await handleCreatingTranscript(text, session, socket);
              } else if (session.sessionState.startsWith("confirming:")) {
                await handleConfirmingTranscript(text, session, socket);
              } else if (session.sessionState.startsWith("awaiting_choice:")) {
                await handleAwaitingChoiceTranscript(text, session, socket);
              } else if (session.sessionState.startsWith("usda_pending:")) {
                await handleUsdaPendingTranscript(text, session, socket);
              } else if (session.sessionState.startsWith("barcode_pending:")) {
                await handleBarcodePendingTranscript(text, session, socket);
              } else if (session.sessionState.startsWith("barcode_naming:")) {
                await handleBarcodeNamingTranscript(text, session, socket);
              } else if (session.sessionState.startsWith("disambiguating:")) {
                await handleDisambiguatingTranscript(text, session, socket);
              } else if (session.sessionState === "confirm_clear_pending") {
                await handleConfirmClearTranscript(text, session, socket);
              } else if (session.sessionState.startsWith("estimate_pending:")) {
                await handleEstimatePendingTranscript(text, session, socket);
              } else {
                await handleNormalTranscript(text, session, socket);
              }
            } catch (err) {
              console.error(
                "[voiceSession] Error handling cloud transcript:",
                err,
              );
              send(socket, {
                type: "error",
                message: "Something went wrong while transcribing audio.",
              } satisfies WSErrorMessage);
            }
          },
        });
      }

      socket.on("message", async (rawData: Buffer | string) => {
        let msg: WSClientMessage;
        try {
          msg = JSON.parse(rawData.toString()) as WSClientMessage;
        } catch {
          return;
        }

        try {
          if (msg.type === "transcript") {
            if (session.sessionState.startsWith("creating:")) {
              await handleCreatingTranscript(msg.text, session, socket);
            } else if (session.sessionState.startsWith("confirming:")) {
              await handleConfirmingTranscript(msg.text, session, socket);
            } else if (session.sessionState.startsWith("awaiting_choice:")) {
              await handleAwaitingChoiceTranscript(msg.text, session, socket);
            } else if (session.sessionState.startsWith("usda_pending:")) {
              await handleUsdaPendingTranscript(msg.text, session, socket);
            } else if (session.sessionState.startsWith("barcode_pending:")) {
              await handleBarcodePendingTranscript(msg.text, session, socket);
            } else if (session.sessionState.startsWith("barcode_naming:")) {
              await handleBarcodeNamingTranscript(msg.text, session, socket);
            } else if (session.sessionState.startsWith("disambiguating:")) {
              await handleDisambiguatingTranscript(msg.text, session, socket);
            } else if (session.sessionState === "confirm_clear_pending") {
              await handleConfirmClearTranscript(msg.text, session, socket);
            } else if (session.sessionState.startsWith("estimate_pending:")) {
              await handleEstimatePendingTranscript(msg.text, session, socket);
            } else {
              await handleNormalTranscript(msg.text, session, socket);
            }
          } else if (msg.type === "barcode_scan") {
            await handleBarcodeScan(msg.gtin, session, socket);
          } else if (msg.type === "audio_chunk") {
            if (cloudStt) {
              const buffer = Buffer.from(msg.data, "base64");
              cloudStt.pushAudioChunk(buffer);
            } else {
              // eslint-disable-next-line no-console
              console.warn(
                "[voiceSession] Received audio_chunk but cloud STT is disabled. Ignoring.",
              );
            }
          } else if (msg.type === "scale_confirm") {
            const result = await handleScaleConfirm(
              msg.itemId,
              msg.quantity,
              msg.unit,
              session.draft,
              session.userId,
            );
            applyMessageToDraft(result, session);
            send(socket, result);
          } else if (msg.type === "save") {
            await saveSession(session, socket);
          } else if (msg.type === "cancel") {
            await cancelSession(session, socket);
          }
        } catch (err) {
          console.error("[voiceSession] Error handling message:", err);
          send(socket, {
            type: "error",
            message: "Something went wrong. Please try again.",
          } satisfies WSErrorMessage);
        }
      });

      socket.on("close", async () => {
        console.log(`[voiceSession] Disconnected — completed: ${session.completed}`);
        if (cloudStt) {
          cloudStt.close();
        }
        // Auto-save if session wasn't explicitly saved or cancelled
        if (!session.completed && session.draft.length > 0) {
          try {
            const itemsToSave = session.draft.filter(
              (item) => item.state === "normal",
            );
            if (itemsToSave.length > 0) {
              await prisma.foodEntry.createMany({
                data: itemsToSave.map((item) => ({
                  userId: session.userId,
                  date: new Date(session.date + "T12:00:00"),
                  mealLabel: item.mealLabel,
                  name: item.name,
                  calories: item.calories,
                  proteinG: item.proteinG,
                  carbsG: item.carbsG,
                  fatG: item.fatG,
                  quantity: item.quantity,
                  unit: item.unit,
                  source: item.source,
                  usdaFdcId: item.usdaFdcId ?? null,
                  customFoodId: item.customFoodId ?? null,
                  communityFoodId: item.communityFoodId ?? null,
                })),
              });
            }
          } catch (err) {
            console.error("[voiceSession] Auto-save on disconnect failed:", err);
          }
        }
      });
    },
  );
}
