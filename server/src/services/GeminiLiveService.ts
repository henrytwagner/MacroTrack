/**
 * GeminiLiveService — manages one Gemini Live (bidirectional audio) session per Kitchen Mode session.
 *
 * Architecture:
 *   iOS (PCM audio chunks) → server (this service) → Gemini Live
 *   Gemini Live (audio + function calls) → server → iOS (audio_data WS msgs + UI events)
 *
 * Import strategy: `import type` only at the top level (erased at compile time).
 * Runtime values (GoogleGenAI, Modality) are loaded via `await import()` inside connect()
 * to satisfy TypeScript's Node16 CJS ↔ ESM boundary rules.
 */

// ---------------------------------------------------------------------------
// Minimal structural types — defined locally so we never import @google/genai
// at the type level in a CJS module (avoids TS1479/TS1541 ESM boundary errors).
// The actual runtime values come from await import("@google/genai") in connect().
// ---------------------------------------------------------------------------

interface GeminiSession {
  sendRealtimeInput(params: {
    audio?: { data: string; mimeType: string };
    audioStreamEnd?: boolean;
  }): void;
  sendClientContent(params: {
    turns: Array<{ role: string; parts: Array<{ text: string }> }>;
  }): void;
  sendToolResponse(params: { functionResponses: GeminiFunctionResponse[] }): void;
  close(): void;
}

interface GeminiServerMessage {
  serverContent?: {
    modelTurn?: {
      parts: Array<{
        inlineData?: { data: string; mimeType: string };
        text?: string;
      }>;
    };
    turnComplete?: boolean;
    interrupted?: boolean;
  };
  toolCall?: {
    functionCalls?: GeminiFunctionCallRaw[];
  };
}

interface GeminiFunctionCallRaw {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

interface GeminiFunctionResponse {
  id?: string;
  name?: string;
  response?: Record<string, unknown>;
}

interface GeminiFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: object;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

/**
 * System prompt enforcing the two-layer nutrition guardrail.
 * Layer 1: natural language instruction.
 * Layer 2 (structural): no estimate_nutrition function exists in the schema.
 */
const SYSTEM_PROMPT = `You are a food logging assistant embedded in a kitchen. Your ONLY job is to help users log food they have eaten.

HARD RULES — never violate these under any circumstances:
1. NEVER generate, estimate, fabricate, or approximate nutritional values (calories, protein, carbs, fat, sodium, etc.).
2. NEVER say things like "that's probably about X calories" or "roughly X grams of protein".
3. ALL nutrition data MUST come from calling lookup_food(). If a food is not found, ask the user to provide the exact values.
4. If asked for nutrition estimates, decline firmly and either look it up or ask the user to provide exact values.
5. Keep responses brief — this is a kitchen environment. One or two short sentences maximum.
6. Do not greet the user or say "Hello" — start helping immediately.
7. After adding an item, do NOT say "Is that correct?", "Shall I add that?", or "Anything else?". Do NOT ask for confirmation. Just say the item name briefly (e.g. "Added chicken") and immediately go silent waiting for the next food.
8. After any successful action, stay quiet and wait. Do not prompt the user or ask follow-up questions unless you need clarification to look up a food.

WORKFLOW:
- When user mentions food → call lookup_food() immediately, do not wait.
- lookup_food returns a single match → immediately call add_to_draft() with the returned food_ref, quantity=1 (or whatever quantity the user specified), and the serving_unit from the lookup result. Do NOT ask the user how much they want — just use 1 serving as the default. Say the name briefly after adding. Go silent.
- lookup_food returns multiple matches → present the options verbally (briefly), wait for user choice, then call add_to_draft().
- lookup_food returns not found → briefly tell the user the food wasn't found in their personal or community foods. Ask: "Would you like to create a custom food, or try the USDA database?" Wait for their answer. Do not proceed until they respond.
- User says "create it" or similar → call begin_custom_food_creation(). Then ask for each nutrition value one at a time. Call report_nutrition_field() for EACH value as it is provided — call it separately for each field even if the user states multiple values at once. Required: calories, protein_g, carbs_g, fat_g, serving_size, serving_unit. When all required values have been reported, call create_custom_food().
- User says "try USDA" or "search USDA" or similar → call search_usda(name) with the food name.
- search_usda returns a single match → call add_to_draft() with the returned food_ref.
- search_usda returns multiple matches → present the options briefly, wait for user choice, then call add_to_draft().
- search_usda returns not found → tell the user and ask if they'd like to create a custom food.
- User provides all macro values → call create_custom_food() with the exact values they stated. Do not fill in any values yourself.
- User says "done", "save", "that's it", "all done" → call save_session().
- User says "cancel", "never mind", "start over" → call cancel_session().
- User says "undo" → call undo().
- User says "redo" → call redo().
- User says "scan" or "barcode" → call open_barcode_scanner().
- If user wants to edit an item quantity → call edit_draft_item() with the item_id from the current draft.
- If user wants to remove an item → call remove_draft_item() with the item_id.`;

// ---------------------------------------------------------------------------
// Function declarations (schema)
// No estimate_nutrition function — structural Layer 2 guardrail.
// Cast to FunctionDeclaration[] because the SDK's Schema type uses a `Type` enum
// but the wire format accepts the same string values ("STRING", "OBJECT", etc.).
// ---------------------------------------------------------------------------

const FUNCTION_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: "lookup_food",
    description:
      "Look up a food item in the database. ALWAYS call this first before add_to_draft. Returns a foodRef that add_to_draft needs.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "The food name to look up (e.g. 'chicken breast', 'brown rice')" } as object,
        quantity: { type: "NUMBER", description: "Amount the user wants to add (optional)" } as object,
        unit: { type: "STRING", description: "Unit for the amount (g, oz, cups, servings, etc.) (optional)" } as object,
      },
      required: ["name"],
    } as object,
  },
  {
    name: "add_to_draft",
    description:
      "Add a food to the current session draft. Call ONLY after lookup_food returns a foodRef. Do not call without a valid foodRef. If the user did not specify a quantity, use quantity=1 with the serving_unit from the lookup result.",
    parameters: {
      type: "OBJECT",
      properties: {
        food_ref: { type: "STRING", description: "The foodRef string from lookup_food (e.g. 'custom:abc123', 'usda:12345', 'community:xyz')" } as object,
        quantity: { type: "NUMBER", description: "Amount to add" } as object,
        unit: { type: "STRING", description: "Unit for the amount" } as object,
        meal_label: { type: "STRING", description: "Meal label. Auto-categorized by the server based on time clustering — only provide if the user explicitly names a meal.", enum: ["breakfast", "lunch", "dinner", "snack"] } as object,
      },
      required: ["food_ref", "quantity", "unit"],
    } as object,
  },
  {
    name: "create_custom_food",
    description:
      "Create a custom food entry using nutrition values provided by the user. ONLY call with values the user explicitly stated. NEVER fill in values yourself.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "Food name" } as object,
        calories: { type: "NUMBER", description: "Calories per serving (exact value from user)" } as object,
        protein_g: { type: "NUMBER", description: "Protein in grams per serving (exact value from user)" } as object,
        carbs_g: { type: "NUMBER", description: "Carbohydrates in grams per serving (exact value from user)" } as object,
        fat_g: { type: "NUMBER", description: "Fat in grams per serving (exact value from user)" } as object,
        serving_size: { type: "NUMBER", description: "Serving size number (e.g. 100)" } as object,
        serving_unit: { type: "STRING", description: "Serving size unit (e.g. 'g', 'oz', 'cup')" } as object,
        quantity: { type: "NUMBER", description: "How much the user is logging now" } as object,
        unit: { type: "STRING", description: "Unit for the logged quantity" } as object,
      },
      required: ["name", "calories", "protein_g", "carbs_g", "fat_g", "serving_size", "serving_unit"],
    } as object,
  },
  {
    name: "report_nutrition_field",
    description:
      "Report a single nutrition value the user has provided during custom food creation. Call once per value — even if the user states multiple values in one utterance, call this function separately for each field. Do NOT call create_custom_food until all required fields have been reported via this function.",
    parameters: {
      type: "OBJECT",
      properties: {
        field_name: {
          type: "STRING",
          description: "One of: calories, protein_g, carbs_g, fat_g, serving_size, serving_unit, brand, barcode",
        } as object,
        value: {
          type: "STRING",
          description: "The value exactly as stated by the user (numeric for macros, string for serving_unit/brand/barcode)",
        } as object,
      },
      required: ["field_name", "value"],
    } as object,
  },
  {
    name: "begin_custom_food_creation",
    description:
      "Start the custom food creation flow after the user has chosen to create a new food (following a lookup_food not_found result). Shows a creation card. Call this before asking for nutrition values.",
    parameters: { type: "OBJECT", properties: {} } as object,
  },
  {
    name: "search_usda",
    description:
      "Explicitly search the USDA database for a food. Only call this when the user has chosen to try USDA after lookup_food returned not_found. USDA data may be inconsistent — mention this briefly.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "The food name to search in USDA" } as object,
      },
      required: ["name"],
    } as object,
  },
  {
    name: "edit_draft_item",
    description: "Edit the quantity or unit of an existing draft item.",
    parameters: {
      type: "OBJECT",
      properties: {
        item_id: { type: "STRING", description: "The id of the draft item to edit (e.g. 'tmp-1')" } as object,
        quantity: { type: "NUMBER", description: "New quantity (omit if only changing unit)" } as object,
        unit: { type: "STRING", description: "New unit (omit if only changing quantity)" } as object,
      },
      required: ["item_id"],
    } as object,
  },
  {
    name: "remove_draft_item",
    description: "Remove an item from the draft.",
    parameters: {
      type: "OBJECT",
      properties: {
        item_id: { type: "STRING", description: "The id of the draft item to remove" } as object,
      },
      required: ["item_id"],
    } as object,
  },
  {
    name: "undo",
    description: "Undo the last draft change.",
    parameters: { type: "OBJECT", properties: {} } as object,
  },
  {
    name: "redo",
    description: "Redo the last undone change.",
    parameters: { type: "OBJECT", properties: {} } as object,
  },
  {
    name: "open_barcode_scanner",
    description: "Open the barcode scanner on the user's device to scan a product.",
    parameters: { type: "OBJECT", properties: {} } as object,
  },
  {
    name: "save_session",
    description: "Save all draft items to the food log and end the session.",
    parameters: { type: "OBJECT", properties: {} } as object,
  },
  {
    name: "cancel_session",
    description: "Cancel the session and discard all draft items.",
    parameters: { type: "OBJECT", properties: {} } as object,
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeminiFunctionCallHandler = (
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface GeminiLiveConfig {
  onAudioOut: (data: string, mimeType: string) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onFunctionCall: GeminiFunctionCallHandler;
  onError: (err: Error) => void;
  onClose: () => void;
  onOpen: () => void;
}

// ---------------------------------------------------------------------------
// GeminiLiveService
// ---------------------------------------------------------------------------

export class GeminiLiveService {
  private session: GeminiSession | null = null;
  private readonly apiKey: string;
  private readonly cfg: GeminiLiveConfig;

  constructor(cfg: GeminiLiveConfig) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your-gemini-api-key-here") {
      throw new Error("GEMINI_API_KEY is not configured. Set it in server/.env");
    }
    this.apiKey = apiKey;
    this.cfg = cfg;
  }

  /**
   * Open the Gemini Live WebSocket session.
   * Uses dynamic import() to cross the CJS→ESM boundary at runtime.
   */
  async connect(): Promise<void> {
    console.log(`[GeminiLive] connecting — model: ${LIVE_MODEL}`);
    // Dynamic import resolves at runtime using the package's CJS `require` export condition.
    const genai = await import("@google/genai");
    const client = new genai.GoogleGenAI({ apiKey: this.apiKey });

    const rawSession = await client.live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: [genai.Modality.AUDIO],
        systemInstruction: SYSTEM_PROMPT,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS as any[] }],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Puck" },
          },
        },
        // Disable thinking mode: 2.5-flash plans function calls in reasoning text but then
        // speaks them verbally instead of executing them. thinkingBudget:0 fixes this.
        // SDK v1.x: set directly on LiveConnectConfig (generationConfig is deprecated).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thinkingConfig: { thinkingBudget: 0 } as any,
      },
      callbacks: {
        onopen: () => {
          console.log("[GeminiLive] session open ✓");
          this.cfg.onOpen();
        },
        // onmessage signature from the SDK uses its own LiveServerMessage type;
        // we cast to our local GeminiServerMessage (structurally compatible).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onmessage: (msg: any) => {
          void this.handleMessage(msg as GeminiServerMessage);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onclose: (e: any) => {
          const code   = e?.code   ?? e?.status    ?? "?";
          const reason = e?.reason ?? e?.statusText ?? e?.message ?? JSON.stringify(e);
          console.log(`[GeminiLive] session closed — code: ${code}, reason: ${reason}`);
          this.cfg.onClose();
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onerror: (e: any) => {
          const msg = e?.message ?? e?.reason ?? JSON.stringify(e);
          console.error(`[GeminiLive] ERROR — ${msg}`);
          if (e && typeof e === "object") {
            console.error("[GeminiLive] error detail:", JSON.stringify(e, null, 2));
          }
          this.cfg.onError(new Error(String(msg)));
        },
      },
    });
    console.log("[GeminiLive] connect() returned session");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.session = rawSession as unknown as GeminiSession;
  }

  private audioChunkCount = 0;

  /** Forward a base64 PCM audio chunk from the iOS client to Gemini. */
  sendAudio(base64PCM: string): void {
    if (!this.session) {
      console.warn("[GeminiLive] sendAudio called but session is null — dropping");
      return;
    }
    this.audioChunkCount++;
    const byteLen = Math.floor(base64PCM.length * 0.75);
    if (this.audioChunkCount <= 5 || this.audioChunkCount % 50 === 0) {
      console.log(`[GeminiLive] → sendAudio #${this.audioChunkCount}, ~${byteLen} bytes`);
    }
    try {
      this.session.sendRealtimeInput({
        audio: { data: base64PCM, mimeType: "audio/pcm;rate=16000" },
      });
    } catch (err) {
      console.error("[GeminiLive] sendRealtimeInput threw:", err);
    }
  }

  /**
   * Signal end of the current audio turn.
   * Called after a silence gap to let Gemini process what was said without waiting
   * for its own VAD to detect end-of-speech (which may take longer in noisy environments).
   */
  sendAudioEnd(): void {
    if (!this.session) return;
    console.log("[GeminiLive] → audioStreamEnd");
    try {
      this.session.sendRealtimeInput({ audioStreamEnd: true });
    } catch (err) {
      console.error("[GeminiLive] sendAudioEnd threw:", err);
    }
  }

  /** Send a text turn to Gemini (used for barcode scan results and legacy transcripts). */
  sendText(text: string): void {
    if (!this.session) return;
    this.session.sendClientContent({
      turns: [{ role: "user", parts: [{ text }] }],
    });
  }

  close(): void {
    try {
      this.session?.close();
    } catch {
      // ignore — session may already be closed
    }
    this.session = null;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async handleMessage(msg: GeminiServerMessage): Promise<void> {
    // Log unrecognized message shapes to expose unknown server event types
    const hasKnownField = msg.serverContent ?? msg.toolCall;
    if (!hasKnownField) {
      console.log("[GeminiLive] ← unknown msg:", JSON.stringify(msg));
    }

    // Audio and transcript from model turn
    if (msg.serverContent?.modelTurn?.parts) {
      let transcriptText = "";
      for (const part of msg.serverContent.modelTurn.parts) {
        if (part.inlineData?.data) {
          console.log(`[GeminiLive] ← audio out ${part.inlineData.data.length} b64 chars, ${part.inlineData.mimeType}`);
          this.cfg.onAudioOut(
            part.inlineData.data,
            part.inlineData.mimeType ?? "audio/pcm;rate=24000",
          );
        }
        if (part.text) {
          console.log(`[GeminiLive] ← text: "${part.text}"`);
          transcriptText += part.text;
        }
      }
      if (transcriptText) {
        this.cfg.onTranscript(transcriptText, msg.serverContent.turnComplete ?? false);
      }
    }
    if (msg.serverContent?.turnComplete) {
      console.log("[GeminiLive] ← turnComplete");
    }

    // Function calls
    if (msg.toolCall?.functionCalls && msg.toolCall.functionCalls.length > 0) {
      await this.processFunctionCalls(msg.toolCall.functionCalls);
    }
  }

  private async processFunctionCalls(calls: GeminiFunctionCallRaw[]): Promise<void> {
    const responses: GeminiFunctionResponse[] = [];

    for (const call of calls) {
      const name = call.name ?? "";
      const args = (call.args ?? {}) as Record<string, unknown>;
      console.log(`[GeminiLive] function call: ${name}`, args);

      let result: unknown;
      try {
        result = await this.cfg.onFunctionCall(name, args);
      } catch (err) {
        console.error(`[GeminiLive] function call handler error (${name}):`, err);
        result = { error: String(err) };
      }

      responses.push({
        id: call.id,
        name,
        response: { output: result },
      });
    }

    if (this.session) {
      this.session.sendToolResponse({ functionResponses: responses });
    }
  }
}
