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
    media?: { data: string; mimeType: string };
    audioStreamEnd?: boolean;
  }): void;
  sendClientContent(params: {
    turns: Array<{
      role: string;
      parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>;
    }>;
    turnComplete?: boolean;
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

// ---------------------------------------------------------------------------
// Composable system prompt — each section is independently editable.
// Future input modalities (camera, AR) add their own section to the array.
// Layer 2 (structural) guardrail: no estimate_nutrition function exists in the schema.
// ---------------------------------------------------------------------------

interface PromptSection {
  name: string;
  content: string;
}

const PROMPT_SECTIONS: PromptSection[] = [
  {
    name: "ROLE",
    content:
      "You are a food logging assistant embedded in a kitchen. Your ONLY job is to help users log food they have eaten.",
  },
  {
    name: "HARD RULES",
    content: `Never violate these under any circumstances:
1. NEVER generate, estimate, fabricate, or approximate nutritional values (calories, protein, carbs, fat, sodium, etc.).
2. NEVER say things like "that's probably about X calories" or "roughly X grams of protein".
3. ALL nutrition data MUST come from calling lookup_food(). If a food is not found, ask the user to provide the exact values.
4. If asked for nutrition estimates, decline firmly and either look it up or ask the user to provide exact values.
5. Keep responses brief — this is a kitchen environment. One or two short sentences maximum.
6. Do not greet the user or say "Hello" — start helping immediately.`,
  },
  {
    name: "SCOPE GUARDRAIL",
    content: `You are ONLY a food logging assistant. You cannot:
- Answer general knowledge questions ("What's the weather?", "Tell me a joke")
- Give dietary advice, meal planning, or nutrition recommendations
- Discuss topics unrelated to logging food the user has eaten
- Comment on whether a food is "healthy" or "unhealthy"
If the user asks something off-topic, say: "I can only help with logging food. What would you like to add?"`,
  },
  {
    name: "CONFIRMATION BEHAVIOR",
    content: `- After add_to_draft succeeds, briefly confirm the item and quantity (e.g. "Added chicken breast"). Then go silent.
- Do NOT say "Is that correct?", "Shall I add that?", or "Anything else?"
- Do NOT ask follow-up questions unless you need clarification to look up a specific food.
- After any successful action, stay quiet and wait for the next food.`,
  },
  {
    name: "FOOD LOOKUP WORKFLOW",
    content: `1. When user mentions a food → call lookup_food() immediately, do not wait.
2. lookup_food returns a single match:
   a) If source is "CUSTOM" or "COMMUNITY" → immediately call add_to_draft() with the returned food_ref, quantity (default 1 if not specified), and the serving_unit from the lookup result. Set quantity_specified=true ONLY if the user explicitly stated a quantity (e.g. "200 grams of chicken", "2 cups of rice"). Omit quantity_specified when using the default serving size. Briefly confirm. Go silent.
   b) If source is "DATABASE" (USDA) → first say the matched food name briefly (e.g. "I found 'Salad dressing, ranch dressing' — adding that."), then call add_to_draft(). This gives the user a moment to correct if the match is wrong.
3. lookup_food returns multiple matches → present options verbally (briefly), wait for user choice, then call add_to_draft() with the chosen food_ref.
4. lookup_food returns not_found → this means the food was NOT found in any database (personal, community, or USDA). Briefly tell the user. Ask: "Would you like to create a custom food, or try searching with different terms?" Wait for their answer.
5. User says "search again" or wants to try different terms → call search_usda() with the modified search terms. Handle single/multiple/not_found the same as lookup_food.
6. The lookup_food response may include "available_units" listing custom unit names the user has set up for this food (e.g. "patty", "fillet"). When the user speaks a quantity with one of these unit names (e.g. "two patties of ground beef"), use that exact unit name in the "unit" field of add_to_draft.`,
  },
  {
    name: "CUSTOM FOOD CREATION FLOW",
    content: `1. User says "create it" → call begin_custom_food_creation().
2. Ask for serving_unit first (e.g. "What unit is the serving — grams, ounces, cups?").
3. Ask for serving_size next (e.g. "And how much is one serving?").
4. Then ask for calories, protein_g, carbs_g, fat_g — one at a time.
5. Call report_nutrition_field() for EACH value as provided. Even if the user states multiple values at once, call it separately for each field.
6. When ALL six required fields (serving_unit, serving_size, calories, protein_g, carbs_g, fat_g) have been reported, call create_custom_food().
7. If the user says "never mind", "forget it", "skip", or wants to stop creating → call abandon_creation() immediately.`,
  },
  {
    name: "TOUCH EDITS",
    content: `If you receive a [touch] message that the user edited or removed an item via touch:
- Acknowledge it briefly (e.g. "Got it" or "Noted").
- Treat the _draft field in your next function response as ground truth for what is currently in the draft.
- Do NOT re-add items that already appear in _draft.
- Do NOT question or undo touch edits.`,
  },
  {
    name: "SCALE INPUT",
    content: `If you receive a [scale] message with a weight confirmation:
- The scale provides the authoritative weight measurement. Do not contradict it.
- Acknowledge briefly (e.g. "Updated to 245 grams").
- Do NOT ask the user to confirm or re-enter the quantity — the scale reading is accurate.`,
  },
  {
    name: "BARCODE INPUT",
    content: `If you receive a [barcode] message:
- If the barcode matched a food, call add_to_draft with the provided food_ref, quantity, and unit. Do NOT set quantity_specified — barcode defaults are not user-specified.
- If the barcode did not match, ask the user to name the food so you can call lookup_food.`,
  },
  {
    name: "CAMERA INPUT",
    content: `If you receive a [camera] message with a food photo:
- The image has been sent to you separately via the media stream — examine it carefully.
- Identify ALL distinct food items visible in the image.
- Briefly list what you see: "I can see X, Y, and Z. Should I add all of them?"
- Wait for the user to confirm (voice or they'll tap items). Do NOT call add_to_draft until confirmed.
- Once confirmed, for each confirmed food: call lookup_food() with the food name and estimated grams. Then call add_to_draft().
- If depth context is provided, use it to inform gram estimates (items closer to the camera = larger portion).
- NEVER estimate nutritional values from the image — ALWAYS use lookup_food() first.
- If you cannot identify a food clearly, describe what you see and ask the user to name it.`,
  },
  {
    name: "DRAFT CONTEXT",
    content: `Every function call response includes a _draft field with the current state of all items in the session.
Use _draft as ground truth for what the user has logged so far. Reference item IDs from _draft when calling edit_draft_item or remove_draft_item.`,
  },
  {
    name: "OTHER COMMANDS",
    content: `- "done" / "save" / "that's it" / "all done" → call save_session().
- "cancel" / "start over" → call cancel_session().
- "undo" → call undo().
- "redo" → call redo().
- "scan" / "barcode" → call open_barcode_scanner().
- Edit quantity → call edit_draft_item() with the item_id from _draft.
- Remove item → call remove_draft_item() with the item_id from _draft.`,
  },
];

/** Build the full system prompt from composable sections. */
function buildSystemPrompt(): string {
  return PROMPT_SECTIONS.map((s) => `## ${s.name}\n${s.content}`).join("\n\n");
}

// ---------------------------------------------------------------------------
// Composable tool declarations — grouped by feature area.
// Future input modalities (camera, AR) add their own group to the array.
// No estimate_nutrition function — structural Layer 2 guardrail.
// Cast to FunctionDeclaration[] because the SDK's Schema type uses a `Type` enum
// but the wire format accepts the same string values ("STRING", "OBJECT", etc.).
// ---------------------------------------------------------------------------

interface ToolGroup {
  name: string;
  tools: GeminiFunctionDeclaration[];
}

// --- Individual tool declarations ---

const lookupFoodDecl: GeminiFunctionDeclaration = {
  name: "lookup_food",
  description:
    "Look up a food in the database (searches personal foods, community foods, AND USDA automatically). You MUST call this before EVERY add_to_draft — no exceptions. Never call add_to_draft without first getting a food_ref from lookup_food or search_usda. " +
    "Extract the food name in its simplest canonical form: " +
    "1) Use singular form ('egg' not 'eggs', 'banana' not 'bananas'). " +
    "2) Put the food noun first, modifiers after ('chicken breast grilled' not 'grilled chicken breast'). " +
    "3) If a brand is mentioned, put the brand in the 'brand' field and keep the generic food name in 'name'. " +
    "4) Drop filler words ('a', 'some', 'piece of', 'serving of'). " +
    "5) Keep cooking method only if nutritionally relevant ('fried' matters, 'sliced' does not).",
  parameters: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING", description: "Canonical food name (e.g. 'chicken breast', 'brown rice', 'greek yogurt')" } as object,
      brand: { type: "STRING", description: "Brand name if the user mentioned one (e.g. 'Chobani', 'Fairlife'). Omit if generic." } as object,
      quantity: { type: "NUMBER", description: "Amount the user wants to add (optional)" } as object,
      unit: { type: "STRING", description: "Unit for the amount (g, oz, cups, servings, etc.) (optional)" } as object,
    },
    required: ["name"],
  } as object,
};

const searchUsdaDecl: GeminiFunctionDeclaration = {
  name: "search_usda",
  description:
    "Re-search the USDA database with different search terms. Note: USDA is already searched automatically by lookup_food. Only call this when the user wants to retry with a different or more specific query after lookup_food returned not_found.",
  parameters: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING", description: "The food name to search in USDA" } as object,
    },
    required: ["name"],
  } as object,
};

const addToDraftDecl: GeminiFunctionDeclaration = {
  name: "add_to_draft",
  description:
    "Add a food to the draft. REQUIRES a valid food_ref from lookup_food or search_usda. Never fabricate a food_ref. Default: quantity=1, unit=serving_unit from lookup.",
  parameters: {
    type: "OBJECT",
    properties: {
      food_ref: { type: "STRING", description: "The foodRef string from lookup_food (e.g. 'custom:abc123', 'usda:12345', 'community:xyz')" } as object,
      quantity: { type: "NUMBER", description: "Amount to add" } as object,
      unit: { type: "STRING", description: "Unit for the amount" } as object,
      meal_label: { type: "STRING", description: "Meal label. Auto-categorized by the server based on time clustering — only provide if the user explicitly names a meal.", enum: ["breakfast", "lunch", "dinner", "snack"] } as object,
      quantity_specified: { type: "BOOLEAN", description: "Set to true ONLY when the user explicitly stated a quantity (e.g. '200 grams', '2 cups'). Omit or set false when using default serving size." } as object,
    },
    required: ["food_ref", "quantity", "unit"],
  } as object,
};

const editDraftItemDecl: GeminiFunctionDeclaration = {
  name: "edit_draft_item",
  description: "Edit the quantity or unit of an existing draft item. Use the item_id from the _draft context.",
  parameters: {
    type: "OBJECT",
    properties: {
      item_id: { type: "STRING", description: "The id of the draft item to edit (e.g. 'tmp-1')" } as object,
      quantity: { type: "NUMBER", description: "New quantity (omit if only changing unit)" } as object,
      unit: { type: "STRING", description: "New unit (omit if only changing quantity)" } as object,
    },
    required: ["item_id"],
  } as object,
};

const removeDraftItemDecl: GeminiFunctionDeclaration = {
  name: "remove_draft_item",
  description: "Remove an item from the draft. Use the item_id from the _draft context.",
  parameters: {
    type: "OBJECT",
    properties: {
      item_id: { type: "STRING", description: "The id of the draft item to remove" } as object,
    },
    required: ["item_id"],
  } as object,
};

const beginCreationDecl: GeminiFunctionDeclaration = {
  name: "begin_custom_food_creation",
  description:
    "Start the custom food creation flow after the user has chosen to create a new food (following a lookup_food not_found result). Shows a creation card. Call this before asking for nutrition values.",
  parameters: { type: "OBJECT", properties: {} } as object,
};

const reportFieldDecl: GeminiFunctionDeclaration = {
  name: "report_nutrition_field",
  description:
    "Report a single nutrition value during custom food creation. Call once per field. IMPORTANT: Report serving_unit (string) BEFORE serving_size (number). Then calories, protein_g, carbs_g, fat_g. Do NOT call create_custom_food until all six required fields reported.",
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
};

const createCustomFoodDecl: GeminiFunctionDeclaration = {
  name: "create_custom_food",
  description:
    "Create a custom food. ONLY call after ALL required fields (serving_unit, serving_size, calories, protein_g, carbs_g, fat_g) have been reported via report_nutrition_field. Never fill in values yourself.",
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
};

const abandonCreationDecl: GeminiFunctionDeclaration = {
  name: "abandon_creation",
  description:
    "Abandon the current custom food creation. Call when the user says 'never mind', 'forget it', 'skip', or wants to stop creating the current food. Removes the creation card.",
  parameters: { type: "OBJECT", properties: {} } as object,
};

const undoDecl: GeminiFunctionDeclaration = {
  name: "undo",
  description: "Undo the last draft change.",
  parameters: { type: "OBJECT", properties: {} } as object,
};

const redoDecl: GeminiFunctionDeclaration = {
  name: "redo",
  description: "Redo the last undone change.",
  parameters: { type: "OBJECT", properties: {} } as object,
};

const saveSessionDecl: GeminiFunctionDeclaration = {
  name: "save_session",
  description: "Save all draft items to the food log and end the session.",
  parameters: { type: "OBJECT", properties: {} } as object,
};

const cancelSessionDecl: GeminiFunctionDeclaration = {
  name: "cancel_session",
  description: "Cancel the session and discard all draft items.",
  parameters: { type: "OBJECT", properties: {} } as object,
};

const openBarcodeScannerDecl: GeminiFunctionDeclaration = {
  name: "open_barcode_scanner",
  description: "Open the barcode scanner on the user's device to scan a product.",
  parameters: { type: "OBJECT", properties: {} } as object,
};

// --- Tool groups ---

const TOOL_GROUPS: ToolGroup[] = [
  { name: "lookup", tools: [lookupFoodDecl, searchUsdaDecl] },
  { name: "draft", tools: [addToDraftDecl, editDraftItemDecl, removeDraftItemDecl] },
  { name: "creation", tools: [beginCreationDecl, reportFieldDecl, createCustomFoodDecl, abandonCreationDecl] },
  { name: "session", tools: [undoDecl, redoDecl, saveSessionDecl, cancelSessionDecl] },
  { name: "device", tools: [openBarcodeScannerDecl] },
];

/** Build the flat tool declarations array from all registered groups. */
function buildToolDeclarations(): GeminiFunctionDeclaration[] {
  return TOOL_GROUPS.flatMap((g) => g.tools);
}

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
        systemInstruction: buildSystemPrompt(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ functionDeclarations: buildToolDeclarations() as any[] }],
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

  /**
   * Send a captured JPEG photo to Gemini with an accompanying text prompt.
   * Uses sendClientContent (ordered turn) so the image and text arrive together
   * and Gemini processes them as one multimodal turn. sendRealtimeInput/media is
   * for streaming video frames and has non-deterministic ordering — unsuitable
   * for single-shot photo identification.
   */
  sendImageWithPrompt(base64JPEG: string, prompt: string): void {
    if (!this.session) {
      console.warn("[GeminiLive] sendImageWithPrompt called but session is null — dropping");
      return;
    }
    console.log(`[GeminiLive] → sendImageWithPrompt, ~${Math.floor(base64JPEG.length * 0.75)} bytes`);
    try {
      this.session.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [
              { inlineData: { data: base64JPEG, mimeType: "image/jpeg" } },
              { text: prompt },
            ],
          },
        ],
        turnComplete: true,
      });
    } catch (err) {
      console.error("[GeminiLive] sendImageWithPrompt threw:", err);
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
      const startMs = Date.now();
      console.log(`[GeminiLive] ← function call: ${name}`, JSON.stringify(args));

      let result: unknown;
      try {
        result = await this.cfg.onFunctionCall(name, args);
      } catch (err) {
        console.error(`[GeminiLive] function call handler error (${name}):`, err);
        result = { error: String(err) };
      }

      const durationMs = Date.now() - startMs;
      console.log(
        `[GeminiLive] → function response: ${name} (${durationMs}ms)`,
        JSON.stringify(result),
      );

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
