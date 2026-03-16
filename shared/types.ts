// ============================================================
// MacroTrack — Shared Type Definitions
// Used by both mobile/ and server/ packages.
// ============================================================

// --- Enums & Constants ---

export type FoodSource = "DATABASE" | "CUSTOM" | "COMMUNITY";

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
  | "tsp"
  | "fl oz"
  | "L"
  | "portion"
  | "can"
  | "bottle"
  | "packet"
  | "clove"
  | "scoop";

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

// --- User Profile & Goals ---

export type Sex = "MALE" | "FEMALE" | "UNSPECIFIED";

export type ActivityLevel =
  | "SEDENTARY"
  | "LIGHT"
  | "MODERATE"
  | "HIGH"
  | "VERY_HIGH";

export type UnitSystem = "METRIC" | "IMPERIAL";

export type GoalType = "CUT" | "MAINTAIN" | "GAIN";

export type GoalAggressiveness = "MILD" | "STANDARD" | "AGGRESSIVE";

export interface UserProfile {
  heightCm?: number;
  weightKg?: number;
  sex: Sex;
  /** Full date of birth (YYYY-MM-DD). Canonical source; age is derived from this. */
  dateOfBirth?: string;
  /** Read-only: age in whole years, derived from dateOfBirth. Only present in API responses. */
  ageYears?: number;
  activityLevel?: ActivityLevel;
  preferredUnits: UnitSystem;
  currentGoalProfileId?: string;
}

export interface CustomFood extends Macros, ExtendedNutrition {
  id: string;
  name: string;
  servingSize: number;
  servingUnit: string;
  createdAt: string;
  updatedAt: string;
}

export type CommunityFoodStatus = "ACTIVE" | "PENDING" | "RETIRED";

export interface CommunityFood extends Macros, ExtendedNutrition {
  id: string;
  name: string;
  brandName?: string;
  description?: string;
  defaultServingSize: number;
  defaultServingUnit: string;
  usdaFdcId?: number;
  createdByUserId?: string;
  status: CommunityFoodStatus;
  usesCount: number;
  reportsCount: number;
  trustScore: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-food unit configuration that maps a friendly unit name
 * (e.g., "slice", "cup") back to the food's base serving
 * (servingSize + servingUnit for custom foods, or the USDA
 * serving size for database foods).
 */
export interface FoodUnitConversion {
  id: string;
  /**
   * Display name of the unit (e.g., "slice", "cup").
   */
  unitName: string;
  /**
   * How many base servings this unit represents.
   *
   * Examples:
   * - Base serving: 100 g, 1 slice = 30 g → quantityInBaseServings = 0.3
   * - Base serving: 1 serving, 1 cup = 2 servings → quantityInBaseServings = 2
   */
  quantityInBaseServings: number;
  customFoodId?: string;
  usdaFdcId?: number;
}

export interface CreateFoodUnitConversionRequest {
  unitName: string;
  quantityInBaseServings: number;
  customFoodId?: string;
  usdaFdcId?: number;
}

export interface UpdateFoodUnitConversionRequest {
  quantityInBaseServings?: number;
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
  communityFoodId?: string;
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
  usesCount?: number;
}

export interface UserPreferences {
  suppressUsdaWarning: boolean;
}

// --- Search Response ---

export interface UnifiedSearchResponse {
  myFoods: CustomFood[];
  community: CommunityFood[];
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
  communityFoodId?: string;
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
  communityFoodId?: string;
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
  communityFoodId?: string;
}

export interface UpdateFoodEntryRequest {
  quantity?: number;
  unit?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
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

export interface CreateCommunityFoodRequest {
  name: string;
  brandName?: string;
  description?: string;
  defaultServingSize: number;
  defaultServingUnit: string;
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
  barcode?: string;
  barcodeType?: string;
}

export interface PublishCustomFoodRequest {
  brandName?: string;
  barcode?: string;
  barcodeType?: string;
}

export interface UpdateGoalsRequest {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface GoalProfileSummary {
  id: string;
  name: string;
  goalType: GoalType;
  aggressiveness: GoalAggressiveness;
  effectiveDate: string; // YYYY-MM-DD
}

export interface GoalForDateResponse {
  date: string; // YYYY-MM-DD
  goals: DailyGoal | null;
  profile: GoalProfileSummary | null;
}

export interface UpdateGoalsForDateRequest {
  effectiveDate: string; // YYYY-MM-DD
  macros: Macros;
  goalType: GoalType;
  aggressiveness: GoalAggressiveness;
  profileId?: string;
  newProfileName?: string;
}

export interface GoalProfileListItem {
  id: string;
  name: string;
  createdAt: string;
  archivedAt: string | null;
  lastEffectiveDate: string | null;
}

export interface GoalProfilesResponse {
  profiles: GoalProfileListItem[];
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

export type DraftCardState = "normal" | "clarifying" | "creating" | "choice" | "usda_pending";

export interface DraftItem extends Macros {
  id: string; // temporary client-side ID (e.g., "tmp-1")
  name: string;
  quantity: number;
  unit: string;
  source: FoodSource;
  usdaFdcId?: number;
  customFoodId?: string;
  communityFoodId?: string;
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

export interface WSAudioChunkMessage {
  type: "audio_chunk";
  /**
   * Base64-encoded audio data (e.g., 16 kHz mono PCM).
   */
  data: string;
  /**
   * Monotonic sequence number so the server can reassemble the stream.
   */
  sequence: number;
}

export interface WSSaveMessage {
  type: "save";
}

export interface WSCancelMessage {
  type: "cancel";
}

export interface WSBarcodeScanMessage {
  type: "barcode_scan";
  gtin: string;
}

export type WSClientMessage =
  | WSTranscriptMessage
  | WSAudioChunkMessage
  | WSSaveMessage
  | WSCancelMessage
  | WSBarcodeScanMessage;

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

export interface WSFoodChoiceMessage {
  type: "food_choice";
  itemId: string;
  foodName: string;
  question: string;
}

export interface WSUsdaConfirmMessage {
  type: "usda_confirm";
  itemId: string;
  usdaDescription: string;
  question: string;
  usdaResult: USDASearchResult;
}

export interface WSOpenBarcodeScannerMessage {
  type: "open_barcode_scanner";
}

export interface WSAskMessage {
  type: "ask";
  question: string; // pure TTS — no card created
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

export interface WSDraftReplacedMessage {
  type: "draft_replaced";
  draft: DraftItem[];
  message: string;
}

export interface WSOperationCancelledMessage {
  type: "operation_cancelled";
  itemId: string;
  message: string;
}

export type WSServerMessage =
  | WSItemsAddedMessage
  | WSItemEditedMessage
  | WSItemRemovedMessage
  | WSClarifyMessage
  | WSCreateFoodPromptMessage
  | WSCreateFoodFieldMessage
  | WSCreateFoodCompleteMessage
  | WSFoodChoiceMessage
  | WSUsdaConfirmMessage
  | WSOpenBarcodeScannerMessage
  | WSAskMessage
  | WSErrorMessage
  | WSSessionSavedMessage
  | WSSessionCancelledMessage
  | WSDraftReplacedMessage
  | WSOperationCancelledMessage;

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

export interface GeminiOpenBarcodeScannerIntent {
  action: "OPEN_BARCODE_SCANNER";
  payload: null;
}

export interface GeminiCancelOperationIntent {
  action: "CANCEL_OPERATION";
  payload: null;
}

export interface GeminiUndoIntent {
  action: "UNDO";
  payload: null;
}

export interface GeminiRedoIntent {
  action: "REDO";
  payload: null;
}

export type GeminiIntent =
  | GeminiAddItemsIntent
  | GeminiEditItemIntent
  | GeminiRemoveItemIntent
  | GeminiClarifyIntent
  | GeminiCreateFoodResponseIntent
  | GeminiSessionEndIntent
  | GeminiOpenBarcodeScannerIntent
  | GeminiCancelOperationIntent
  | GeminiUndoIntent
  | GeminiRedoIntent;

// --- Gemini Request Context ---

export interface GeminiRequestContext {
  transcript: string;
  currentDraft: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
    /** Used by server to recompute macros when quantity/unit is edited. */
    source?: FoodSource;
    customFoodId?: string;
    usdaFdcId?: number;
    communityFoodId?: string;
  }>;
  timeOfDay: string; // HH:MM format
  date: string; // YYYY-MM-DD
  sessionState: "normal" | `creating:${string}` | `awaiting_choice:${string}` | `usda_pending:${string}`; // "creating:tmp-3" when mid-creation
  creatingFoodProgress?: CreatingFoodProgress;
}
