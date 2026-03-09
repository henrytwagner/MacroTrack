import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { prisma } from "../db/client.js";
import { getDefaultUserId } from "../db/defaultUser.js";
import { processTranscript } from "../services/foodParser.js";
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
  GeminiRequestContext,
  GeminiCreateFoodResponseIntent,
  MealLabel,
} from "../../../shared/types.js";

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
  sessionState: "normal" | `creating:${string}`;
  creatingFoodName: string;
  creatingFoodProgress: CreatingFoodProgress | null;
  customFoodsCreatedThisSession: string[];
  completed: boolean; // true once save/cancel has been sent
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

function draftContext(
  draft: DraftItem[],
): GeminiRequestContext["currentDraft"] {
  return draft.map((d) => ({
    id: d.id,
    name: d.name,
    quantity: d.quantity,
    unit: d.unit,
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
    sessionState: session.sessionState,
    creatingFoodProgress: progress,
  };

  let intent: GeminiCreateFoodResponseIntent;
  try {
    const raw = await parseTranscript(context);
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

      const session: VoiceSessionState = {
        userId,
        date,
        draft: [],
        sessionState: "normal",
        creatingFoodName: "",
        creatingFoodProgress: null,
        customFoodsCreatedThisSession: [],
        completed: false,
      };

      console.log(`[voiceSession] Connected — date: ${date}`);

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
            } else {
              await handleNormalTranscript(msg.text, session, socket);
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
