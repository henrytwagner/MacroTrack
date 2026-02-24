// ============================================================
// MacroTrack — Shared Type Definitions
// Used by both mobile/ and server/ packages.
// ============================================================

// --- Enums & Constants ---

export type FoodSource = "DATABASE" | "CUSTOM";

export type MealLabel = "breakfast" | "lunch" | "dinner" | "snack";

export type SessionStatus = "active" | "completed" | "cancelled";

export type NutritionUnit =
  | "g"
  | "oz"
  | "cups"
  | "servings"
  | "slices"
  | "pieces"
  | "ml"
  | "tbsp"
  | "tsp";

// --- Core Domain Models ---

export interface Macros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface ExtendedNutrition {
  sodiumMg?: number;
  cholesterolMg?: number;
  fiberG?: number;
  sugarG?: number;
  saturatedFatG?: number;
  transFatG?: number;
}

export interface DailyGoal extends Macros {
  id: string;
}

export interface CustomFood extends Macros, ExtendedNutrition {
  id: string;
  name: string;
  servingSize: number;
  servingUnit: string;
  createdAt: string;
  updatedAt: string;
}

export interface FoodEntry extends Macros {
  id: string;
  date: string; // ISO date string
  mealLabel: MealLabel;
  name: string;
  quantity: number;
  unit: string;
  source: FoodSource;
  usdaFdcId?: number;
  customFoodId?: string;
  createdAt: string;
}

// --- USDA API Types ---

export interface USDASearchResult {
  fdcId: number;
  description: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  macros: Macros;
}

// --- Search Response ---

export interface UnifiedSearchResponse {
  myFoods: CustomFood[];
  database: USDASearchResult[];
}

// --- Frequent / Recent ---

export interface FrequentFood {
  name: string;
  source: FoodSource;
  lastQuantity: number;
  lastUnit: string;
  macros: Macros;
  usdaFdcId?: number;
  customFoodId?: string;
  logCount: number;
}

export interface RecentFood {
  name: string;
  source: FoodSource;
  quantity: number;
  unit: string;
  macros: Macros;
  usdaFdcId?: number;
  customFoodId?: string;
  loggedAt: string;
}

// --- API Request / Response Types ---

export interface CreateFoodEntryRequest {
  date: string; // YYYY-MM-DD
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  quantity: number;
  unit: string;
  source: FoodSource;
  mealLabel: MealLabel;
  usdaFdcId?: number;
  customFoodId?: string;
}

export interface UpdateFoodEntryRequest {
  quantity?: number;
  unit?: string;
}

export interface CreateCustomFoodRequest {
  name: string;
  servingSize: number;
  servingUnit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sodiumMg?: number;
  cholesterolMg?: number;
  fiberG?: number;
  sugarG?: number;
  saturatedFatG?: number;
  transFatG?: number;
}

export type UpdateCustomFoodRequest = Partial<CreateCustomFoodRequest>;

export interface UpdateGoalsRequest {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

// --- Daily Summary (Dashboard) ---

export interface DailySummary {
  date: string;
  goals: DailyGoal | null;
  totals: Macros;
  entries: FoodEntry[];
  entriesByMeal: Record<MealLabel, FoodEntry[]>;
}

// --- Kitchen Mode Draft State ---

export type DraftCardState = "normal" | "clarifying" | "creating";

export interface DraftItem extends Macros {
  id: string; // temporary client-side ID (e.g., "tmp-1")
  name: string;
  quantity: number;
  unit: string;
  source: FoodSource;
  usdaFdcId?: number;
  customFoodId?: string;
  mealLabel: MealLabel;
  state: DraftCardState;
  clarifyQuestion?: string; // shown on card when state === "clarifying"
  creatingProgress?: CreatingFoodProgress; // tracks fields filled so far
}

export interface CreatingFoodProgress {
  servingSize?: number;
  servingUnit?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  currentField: CreatingFoodField;
}

export type CreatingFoodField =
  | "confirm" // "Would you like to create it?"
  | "servingSize"
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "complete";

// --- WebSocket Message Types ---

// Client → Server

export interface WSTranscriptMessage {
  type: "transcript";
  text: string;
}

export interface WSSaveMessage {
  type: "save";
}

export interface WSCancelMessage {
  type: "cancel";
}

export type WSClientMessage =
  | WSTranscriptMessage
  | WSSaveMessage
  | WSCancelMessage;

// Server → Client

export interface WSItemsAddedMessage {
  type: "items_added";
  items: DraftItem[];
}

export interface WSItemEditedMessage {
  type: "item_edited";
  itemId: string;
  changes: Partial<Pick<DraftItem, "name" | "quantity" | "unit" | "calories" | "proteinG" | "carbsG" | "fatG">>;
}

export interface WSItemRemovedMessage {
  type: "item_removed";
  itemId: string;
}

export interface WSClarifyMessage {
  type: "clarify";
  itemId: string;
  question: string;
}

export interface WSCreateFoodPromptMessage {
  type: "create_food_prompt";
  itemId: string;
  foodName: string;
  question: string;
}

export interface WSCreateFoodFieldMessage {
  type: "create_food_field";
  itemId: string;
  foodName: string;
  field: CreatingFoodField;
  question: string;
}

export interface WSCreateFoodCompleteMessage {
  type: "create_food_complete";
  item: DraftItem;
}

export interface WSErrorMessage {
  type: "error";
  message: string;
}

export interface WSSessionSavedMessage {
  type: "session_saved";
  entriesCount: number;
}

export interface WSSessionCancelledMessage {
  type: "session_cancelled";
}

export type WSServerMessage =
  | WSItemsAddedMessage
  | WSItemEditedMessage
  | WSItemRemovedMessage
  | WSClarifyMessage
  | WSCreateFoodPromptMessage
  | WSCreateFoodFieldMessage
  | WSCreateFoodCompleteMessage
  | WSErrorMessage
  | WSSessionSavedMessage
  | WSSessionCancelledMessage;

// --- Gemini Intent Types ---

export interface GeminiAddItemsIntent {
  action: "ADD_ITEMS";
  payload: {
    items: Array<{
      name: string;
      quantity?: number;
      unit?: string;
    }>;
  };
}

export interface GeminiEditItemIntent {
  action: "EDIT_ITEM";
  payload: {
    targetItem: string; // name or reference to identify which draft item
    field: "quantity" | "unit" | "name";
    newValue: string | number; // Gemini may return numbers as strings — coerce in backend
  };
}

export interface GeminiRemoveItemIntent {
  action: "REMOVE_ITEM";
  payload: {
    targetItem: string;
  };
}

export interface GeminiClarifyIntent {
  action: "CLARIFY";
  payload: {
    targetItem: string;
    question: string;
  };
}

export interface GeminiCreateFoodResponseIntent {
  action: "CREATE_FOOD_RESPONSE";
  payload: {
    field: CreatingFoodField;
    value: string | number | boolean; // Gemini may return booleans/numbers as strings — coerce in backend
    unit?: string; // for serving size
  };
}

export interface GeminiSessionEndIntent {
  action: "SESSION_END";
  payload: null;
}

export type GeminiIntent =
  | GeminiAddItemsIntent
  | GeminiEditItemIntent
  | GeminiRemoveItemIntent
  | GeminiClarifyIntent
  | GeminiCreateFoodResponseIntent
  | GeminiSessionEndIntent;

// --- Gemini Request Context ---

export interface GeminiRequestContext {
  transcript: string;
  currentDraft: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
  }>;
  timeOfDay: string; // HH:MM format
  date: string; // YYYY-MM-DD
  sessionState: "normal" | `creating:${string}`; // "creating:tmp-3" when mid-creation
  creatingFoodProgress?: CreatingFoodProgress;
}
