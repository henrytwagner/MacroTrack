import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { prisma } from "../db/client.js";
import { getDefaultUserId } from "../db/defaultUser.js";
import { processTranscript, lookupItemInUsda } from "../services/foodParser.js";
import { parseTranscript } from "../services/gemini.js";

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
  WSItemRemovedMessage,
  WSErrorMessage,
  WSFoodChoiceMessage,
  WSUsdaConfirmMessage,
  WSItemsAddedMessage,
  WSOpenBarcodeScannerMessage,
  WSAskMessage,
  WSDraftReplacedMessage,
  WSOperationCancelledMessage,
  GeminiRequestContext,
  GeminiCreateFoodResponseIntent,
  MealLabel,
  USDASearchResult,
} from "../../../shared/types.js";
import { createCloudSttSession, type CloudSttSession } from "../voice/sttCloudClient.js";

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
];

const CREATION_QUESTIONS: Record<CreatingFoodField, string> = {
  confirm: "", // set dynamically with the food name
  servingSize: "What's the serving size? For example, 100 grams or 1 cup.",
  calories: "How many calories per serving?",
  protein: "How much protein per serving?",
  carbs: "How many carbs?",
  fat: "And how much fat?",
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
    | `awaiting_choice:${string}`
    | `usda_pending:${string}`
    | `barcode_pending:${string}`
    | `barcode_naming:${string}`;
  creatingFoodName: string;
  creatingFoodProgress: CreatingFoodProgress | null;
  customFoodsCreatedThisSession: string[];
  completed: boolean; // true once save/cancel has been sent
  pendingUsdaResult: USDASearchResult | null;
  pendingUsdaItemName: string;
  pendingBarcodeGtin: string;
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
    } satisfies WSCreateFoodFieldMessage);
    return;
  }

  // Fill numeric fields
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

  const nextF = nextField(field);
  progress.currentField = nextF;

  if (nextF === "complete") {
    // All fields gathered — persist the custom food
    try {
      const created = await prisma.customFood.create({
        data: {
          userId: session.userId,
          name: session.creatingFoodName,
          servingSize: progress.servingSize ?? 1,
          servingUnit: progress.servingUnit ?? "servings",
          calories: progress.calories ?? 0,
          proteinG: progress.proteinG ?? 0,
          carbsG: progress.carbsG ?? 0,
          fatG: progress.fatG ?? 0,
        },
      });
      session.customFoodsCreatedThisSession.push(created.id);

      // Transition the draft item from "creating" → "normal"
      const itemIdx = session.draft.findIndex((d) => d.id === tmpId);
      if (itemIdx !== -1) {
        session.draft[itemIdx] = {
          ...session.draft[itemIdx],
          calories: progress.calories ?? 0,
          proteinG: progress.proteinG ?? 0,
          carbsG: progress.carbsG ?? 0,
          fatG: progress.fatG ?? 0,
          source: "CUSTOM",
          customFoodId: created.id,
          state: "normal",
          creatingProgress: undefined,
        };
        session.sessionState = "normal";
        session.creatingFoodProgress = null;
        session.creatingFoodName = "";
        send(socket, {
          type: "create_food_complete",
          item: session.draft[itemIdx],
        } satisfies WSCreateFoodCompleteMessage);
      }
    } catch (err) {
      console.error("[voiceSession] Failed to create custom food:", err);
      send(socket, {
        type: "error",
        message: "Failed to save the custom food. Please try again.",
      } satisfies WSErrorMessage);
    }
    return;
  }

  send(socket, {
    type: "create_food_field",
    itemId: tmpId,
    foodName: session.creatingFoodName,
    field: nextF,
    question: CREATION_QUESTIONS[nextF],
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
    // Transition to creating flow
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
    const usdaResult = await lookupItemInUsda(
      session.pendingUsdaItemName,
      undefined,
      undefined,
      getMealLabel(getTimeOfDay()),
    );
    if (!usdaResult.found) {
      send(socket, {
        type: "error",
        message: `Couldn't find '${session.pendingUsdaItemName}' in the USDA database either. Say 'create it' to add it manually.`,
      } satisfies WSErrorMessage);
      return;
    }

    // Check suppressUsdaWarning preference
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { suppressUsdaWarning: true },
    });

    if (user?.suppressUsdaWarning) {
      // Auto-add without confirmation
      incrementUsdaMetrics(usdaResult.usdaResult.fdcId);
      const item = usdaResult.draft;
      const existing = session.draft.find((d) => d.id === tmpId);
      if (existing) {
        Object.assign(existing, { ...item, id: tmpId });
      } else {
        session.draft.push({ ...item, id: tmpId });
      }
      session.sessionState = "normal";
      session.pendingUsdaResult = null;
      session.pendingUsdaItemName = "";
      send(socket, {
        type: "items_added",
        items: [{ ...item, id: tmpId }],
      } satisfies WSItemsAddedMessage);
    } else {
      // Prompt confirmation
      session.pendingUsdaResult = usdaResult.usdaResult;
      session.sessionState = `usda_pending:${tmpId}`;
      send(socket, {
        type: "usda_confirm",
        itemId: tmpId,
        usdaDescription: usdaResult.usdaResult.description,
        question: `Found '${usdaResult.usdaResult.description}' in USDA. Note: USDA data quality may vary. Say 'confirm' to add, or 'cancel' to go back.`,
        usdaResult: usdaResult.usdaResult,
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
// Barcode scan handlers
// ---------------------------------------------------------------------------

async function handleBarcodeScan(
  gtin: string,
  session: VoiceSessionState,
  socket: WebSocket,
) {
  if (session.sessionState !== "normal") return;

  const record = await prisma.communityFoodBarcode.findUnique({
    where: { barcode: gtin },
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
    session.sessionState = `barcode_pending:${gtin}`;
    session.pendingBarcodeGtin = gtin;
    send(socket, {
      type: "ask",
      question: "I couldn't find that product. Want me to create a custom food?",
    } satisfies WSAskMessage);
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
        customFoodsCreatedThisSession: [],
        completed: false,
        pendingUsdaResult: null,
        pendingUsdaItemName: "",
        pendingBarcodeGtin: "",
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
              } else if (session.sessionState.startsWith("awaiting_choice:")) {
                await handleAwaitingChoiceTranscript(text, session, socket);
              } else if (session.sessionState.startsWith("usda_pending:")) {
                await handleUsdaPendingTranscript(text, session, socket);
              } else if (session.sessionState.startsWith("barcode_pending:")) {
                await handleBarcodePendingTranscript(text, session, socket);
              } else if (session.sessionState.startsWith("barcode_naming:")) {
                await handleBarcodeNamingTranscript(text, session, socket);
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
            } else if (session.sessionState.startsWith("awaiting_choice:")) {
              await handleAwaitingChoiceTranscript(msg.text, session, socket);
            } else if (session.sessionState.startsWith("usda_pending:")) {
              await handleUsdaPendingTranscript(msg.text, session, socket);
            } else if (session.sessionState.startsWith("barcode_pending:")) {
              await handleBarcodePendingTranscript(msg.text, session, socket);
            } else if (session.sessionState.startsWith("barcode_naming:")) {
              await handleBarcodeNamingTranscript(msg.text, session, socket);
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
