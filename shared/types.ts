// ============================================================
// Dialed — Shared Type Definitions
// Used by both mobile/ and server/ packages.
// ============================================================

// --- Enums & Constants ---

export type FoodSource = "DATABASE" | "CUSTOM" | "COMMUNITY" | "DIALED";

export type FoodCategory =
  | "PROTEIN"
  | "DAIRY"
  | "GRAIN"
  | "FRUIT"
  | "VEGETABLE"
  | "FAT_OIL"
  | "BEVERAGE"
  | "CONDIMENT"
  | "SNACK"
  | "PREPARED_MEAL"
  | "LEGUME"
  | "OTHER";

export type MealLabel = "breakfast" | "lunch" | "dinner" | "snack";

export type SessionStatus = "active" | "paused" | "completed" | "cancelled";

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
  potassiumMg?: number;
  calciumMg?: number;
  ironMg?: number;
  vitaminDMcg?: number;
  addedSugarG?: number;
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
  brandName?: string;
  category?: FoodCategory;
  servingSize: number;
  servingUnit: string;
  barcode?: string;
  createdAt: string;
  updatedAt: string;
}

export type CommunityFoodStatus = "ACTIVE" | "PENDING" | "RETIRED";

export interface CommunityFood extends Macros, ExtendedNutrition {
  id: string;
  name: string;
  brandName?: string;
  description?: string;
  category?: FoodCategory;
  commonName?: string;
  defaultServingSize: number;
  defaultServingUnit: string;
  dataSource?: string;
  usdaFdcId?: number;
  createdByUserId?: string;
  status: CommunityFoodStatus;
  usesCount: number;
  reportsCount: number;
  trustScore: number;
  barcode?: string;
  aliases?: string[];
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
  communityFoodId?: string;
  usdaFdcId?: number;
  measurementSystem: 'weight' | 'volume' | 'abstract';
  /** Null/absent = system-level (visible to all). Present = private to this user. */
  userId?: string;
  /** The user who originally authored this conversion. */
  createdByUserId?: string;
}

export interface CreateFoodUnitConversionRequest {
  unitName: string;
  quantityInBaseServings: number;
  customFoodId?: string;
  communityFoodId?: string;
  usdaFdcId?: number;
  measurementSystem?: 'weight' | 'volume' | 'abstract';
}

export interface UpdateFoodUnitConversionRequest {
  quantityInBaseServings?: number;
}

export interface CascadeUnitConversionsRequest {
  updates: Array<{ id: string; quantityInBaseServings: number }>;
}

// --- User Food Preferences ---

export interface UserFoodPreference {
  id: string;
  customFoodId?: string;
  communityFoodId?: string;
  usdaFdcId?: number;
  defaultQuantity?: number;
  defaultUnit?: string;
}

export interface UpsertFoodPreferenceRequest {
  defaultQuantity?: number;
  defaultUnit?: string;
}

export interface FoodEntry extends Macros {
  id: string;
  date: string; // ISO date string
  mealLabel: MealLabel;
  name: string;
  quantity: number;
  unit: string;
  source: FoodSource;
  confirmedViaScale?: boolean;
  usdaFdcId?: number;
  customFoodId?: string;
  communityFoodId?: string;
  savedMealId?: string;
  mealInstanceId?: string;
  createdAt: string;
  loggedAt: string;
}

// --- Saved Meals ---

export interface SavedMealItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: FoodSource;
  usdaFdcId?: number;
  customFoodId?: string;
  communityFoodId?: string;
}

export interface SavedMeal {
  id: string;
  name: string;
  items: SavedMealItem[];
  createdAt: string;
}

export interface CreateSavedMealItemRequest {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: FoodSource;
  usdaFdcId?: number;
  customFoodId?: string;
  communityFoodId?: string;
}

export interface CreateSavedMealRequest {
  name: string;
  items: CreateSavedMealItemRequest[];
}

export interface LogMealRequest {
  date: string; // YYYY-MM-DD
  mealLabel: MealLabel;
  scaleFactor: number; // 1.0 = full meal
}

// --- USDA API Types ---

export interface USDASearchResult {
  fdcId: number;
  description: string;
  brandName?: string;
  dataType?: string;
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
  dialed: CommunityFood[];
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
  confirmedViaScale?: boolean;
  usdaFdcId?: number;
  customFoodId?: string;
  communityFoodId?: string;
  loggedAt?: string; // ISO 8601 — when the meal was eaten (defaults to now on server)
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
  brandName?: string;
  category?: FoodCategory;
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
  potassiumMg?: number;
  calciumMg?: number;
  ironMg?: number;
  vitaminDMcg?: number;
  addedSugarG?: number;
  barcode?: string;
}

export type UpdateCustomFoodRequest = Partial<CreateCustomFoodRequest>;

export interface CreateCommunityFoodRequest {
  name: string;
  brandName?: string;
  description?: string;
  category?: FoodCategory;
  commonName?: string;
  defaultServingSize: number;
  defaultServingUnit: string;
  dataSource?: string;
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
  potassiumMg?: number;
  calciumMg?: number;
  ironMg?: number;
  vitaminDMcg?: number;
  addedSugarG?: number;
  aliases?: string[];
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

// --- Summary & Stats ---

export interface DailySummaryItem {
  date: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  entryCount: number;
  goalCalories?: number;
  goalProteinG?: number;
  goalCarbsG?: number;
  goalFatG?: number;
}

export interface DateRangeSummaryResponse {
  summaries: DailySummaryItem[];
}

// --- Weight Tracking ---

export interface WeightEntry {
  id: string;
  date: string;
  weightKg: number;
  note?: string;
  createdAt: string;
}

export interface CreateWeightEntryRequest {
  date: string;
  weightKg: number;
  note?: string;
}

export interface WeightMovingAvgPoint {
  date: string;
  value: number;
}

export interface WeightTrendResponse {
  entries: WeightEntry[];
  movingAverage7Day: WeightMovingAvgPoint[];
  weeklyRateKg: number | null;
}

// --- Food Frequency & Meal Stats ---

export interface FoodFrequencyItem {
  name: string;
  source: FoodSource;
  totalLogCount: number;
  avgCalories: number;
  lastLoggedDate: string;
}

export interface FrequentMeal {
  savedMealId: string;
  name: string;
  totalMacros: Macros;
  itemCount: number;
  logCount: number;
  lastLoggedDate: string;
}

// --- Kitchen Mode Draft State ---

/**
 * Active states used by the Gemini Live (Phase E) server.
 * The `pending` state is new: card is shown while Gemini is looking up / speaking options.
 */
export type DraftCardState =
  | "normal"
  | "pending"       // Phase E: item acknowledged, lookup in progress
  | "disambiguate"  // multiple USDA matches — visual option card
  // --- DEPRECATED: only used by the React Native app (pre-Phase E) ---
  /** @deprecated Phase E server no longer emits this. */
  | "clarifying"
  /** @deprecated Phase E server no longer emits this. */
  | "creating"
  /** @deprecated Phase E server no longer emits this. */
  | "confirming"
  /** @deprecated Phase E server no longer emits this. */
  | "choice"
  /** @deprecated Phase E server no longer emits this. */
  | "usda_pending"
  /** @deprecated Phase E server no longer emits this. */
  | "confirm_clear"
  /** @deprecated never triggered. */
  | "community_submit_prompt"
  /** @deprecated Phase E server no longer emits this. */
  | "history_results"
  /** @deprecated Phase E server no longer emits this. */
  | "macro_summary"
  /** @deprecated Phase E server no longer emits this. */
  | "food_info"
  /** @deprecated Phase E server no longer emits this. */
  | "food_suggestions"
  /** @deprecated Phase E server no longer emits this. */
  | "estimate_card";

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
  initialQuantity?: number;  // from user's original query (e.g. "two cups of X")
  initialUnit?: string;
  confirmingData?: {
    quantityMismatch: boolean;   // true when initialUnit ≠ servingUnit
    collectedValues: CreatingFoodProgress;
  };
  isAssumed?: boolean; // true when quantity/unit inferred from history
  confirmedViaScale?: boolean; // true when quantity was confirmed via BLE scale
  isEstimate?: boolean; // true when macros are AI-estimated
  estimateConfidence?: "high" | "medium" | "low";
  disambiguationOptions?: DisambiguationOption[]; // populated when state === "disambiguate"
  historyData?: {
    dateLabel: string;
    entries: HistoryFoodEntry[];
    totals: Macros;
    addedToDraft: boolean;
  };
}

export interface CreatingFoodProgress {
  servingSize?: number;
  servingUnit?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  brand?: string;    // empty = skipped
  barcode?: string;  // empty = skipped
  currentField: CreatingFoodField;
}

export type CreatingFoodField =
  | "confirm" // "Would you like to create it?"
  | "servingSize"
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "brand"    // skippable ("skip" = no brand)
  | "barcode"  // skippable
  | "complete";

// --- Disambiguation Types (Phase 2) ---

export interface DisambiguationOption {
  label: string;
  usdaResult: USDASearchResult;
}

// --- History Types (Phase 4) ---

export interface HistoryFoodEntry {
  name: string;
  quantity: number;
  unit: string;
  macros: Macros;
}

// --- Macro Summary (Phase 5) ---

export interface MacroSummary {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  goals: Macros | null;
}

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

export interface WSCameraCaptureMessage {
  type: "camera_capture";
  imageBase64: string;
  depthContext?: string;
  /** When false, Gemini should add all identified foods directly without asking for voice confirmation. */
  voiceEnabled?: boolean;
}

export interface WSScaleConfirmMessage {
  type: 'scale_confirm';
  itemId: string;
  quantity: number;
  unit: string; // scale's unit: 'g' | 'ml' | 'oz'
}

export interface WSTouchEditItemMessage {
  type: "touch_edit_item";
  itemId: string;
  quantity: number;
  unit: string;
}

export interface WSTouchRemoveItemMessage {
  type: "touch_remove_item";
  itemId: string;
}

export interface WSTouchCompleteCreationMessage {
  type: "touch_complete_creation";
  itemId: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingSize: number;
  servingUnit: string;
}

export interface WSTouchDismissChoiceMessage {
  type: "touch_dismiss_choice";
  itemId: string;
}

export interface WSPauseMessage {
  type: "pause";
  localItems?: DraftItem[];
}

export type WSClientMessage =
  | WSTranscriptMessage
  | WSAudioChunkMessage
  | WSSaveMessage
  | WSCancelMessage
  | WSPauseMessage
  | WSBarcodeScanMessage
  | WSCameraCaptureMessage
  | WSScaleConfirmMessage
  | WSTouchEditItemMessage
  | WSTouchRemoveItemMessage
  | WSTouchCompleteCreationMessage
  | WSTouchDismissChoiceMessage;

// Server → Client

export interface WSItemsAddedMessage {
  type: "items_added";
  items: DraftItem[];
}

export interface WSItemEditedMessage {
  type: "item_edited";
  itemId: string;
  changes: Partial<Pick<DraftItem, "name" | "quantity" | "unit" | "calories" | "proteinG" | "carbsG" | "fatG" | "isAssumed">>;
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
  collectedValues?: Partial<CreatingFoodProgress>;
}

export interface WSCreateFoodCompleteMessage {
  type: "create_food_complete";
  item: DraftItem;
}

export interface WSCreateFoodConfirmMessage {
  type: "create_food_confirm";
  itemId: string;
  foodName: string;
  collectedValues: CreatingFoodProgress;
  initialQuantity?: number;
  initialUnit?: string;
  quantityMismatch: boolean; // true when initialUnit ≠ servingUnit
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

export interface WSSessionPausedMessage {
  type: "session_paused";
  entriesCount: number;
  draftItemsCount: number;
}

export interface WSSessionResumedMessage {
  type: "session_resumed";
  items: DraftItem[];
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

// Phase 2 — Disambiguation
export interface WSDisambiguateMessage {
  type: "disambiguate";
  itemId: string;
  foodName: string;
  question: string;
  options: DisambiguationOption[];
}

// Phase 3 — Power User Flows
export interface WSConfirmClearMessage {
  type: "confirm_clear";
  question: string;
}

export interface WSCommunitySubmitPromptMessage {
  type: "community_submit_prompt";
  itemId: string;
  foodName: string;
  question: string;
}

// Phase 4 — History
export interface WSHistoryResultsMessage {
  type: "history_results";
  itemId: string;
  dateLabel: string;
  mealLabel?: MealLabel;
  entries: HistoryFoodEntry[];
  totals: Macros;
  addedToDraft: boolean;
}

// Phase 5 — Grounded AI Information
export interface WSMacroSummaryMessage {
  type: "macro_summary";
  itemId: string;
  summary: MacroSummary;
}

export interface WSFoodInfoMessage {
  type: "food_info";
  itemId: string;
  foodName: string;
  usdaResult: USDASearchResult;
  question?: string;
}

export interface WSFoodSuggestionsMessage {
  type: "food_suggestions";
  itemId: string;
  suggestions: Array<{ name: string; macros: Macros; reason: string }>;
}

// Scale integration
export interface WSPromptScaleConfirmMessage {
  type: 'prompt_scale_confirm';
  itemId: string;
}

// Phase 6 — AI Estimates
export interface WSEstimateCardMessage {
  type: "estimate_card";
  item: DraftItem;
  canAddAnyway: boolean;
}

// Phase E (Gemini Live) — new server→client messages
/** Raw PCM audio from Gemini's voice, base64-encoded. iOS plays this via AVAudioPlayerNode. */
export interface WSAudioDataMessage {
  type: "audio_data";
  /** Base64-encoded PCM audio. MIME type is audio/pcm;rate=24000 unless noted otherwise. */
  data: string;
  mimeType: string;
}

/**
 * Live transcript from Gemini (for on-screen captions).
 * Note: the client→server message also has type "transcript" (WSTranscriptMessage) but lives in
 * WSClientMessage — no collision at the union level.
 */
export interface WSServerTranscriptMessage {
  type: "transcript";
  text: string;
  isFinal: boolean;
}

export type WSServerMessage =
  | WSItemsAddedMessage
  | WSItemEditedMessage
  | WSItemRemovedMessage
  | WSClarifyMessage
  | WSCreateFoodPromptMessage
  | WSCreateFoodFieldMessage
  | WSCreateFoodCompleteMessage
  | WSCreateFoodConfirmMessage
  | WSFoodChoiceMessage
  | WSUsdaConfirmMessage
  | WSOpenBarcodeScannerMessage
  | WSAskMessage
  | WSErrorMessage
  | WSSessionSavedMessage
  | WSSessionCancelledMessage
  | WSSessionPausedMessage
  | WSSessionResumedMessage
  | WSDraftReplacedMessage
  | WSOperationCancelledMessage
  | WSDisambiguateMessage
  | WSConfirmClearMessage
  | WSCommunitySubmitPromptMessage
  | WSHistoryResultsMessage
  | WSMacroSummaryMessage
  | WSFoodInfoMessage
  | WSFoodSuggestionsMessage
  | WSEstimateCardMessage
  | WSPromptScaleConfirmMessage
  // Phase E (Gemini Live)
  | WSAudioDataMessage
  | WSServerTranscriptMessage;

// --- Voice Session Summary (REST) ---

export interface VoiceSessionSummary {
  id: string;
  date: string;
  status: SessionStatus;
  startedAt: string;
  confirmedItems: FoodEntry[];
  draftItems: DraftItem[];
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  itemCount: number;
}

// --- Photo Identification (REST) ---

/** Response from POST /api/food/identify-photo */
export interface PhotoIdentificationResult {
  /** "custom" | "community" | "usda" | null (no match) */
  source: string | null;
  food: CustomFood | CommunityFood | USDASearchResult | null;
  estimatedGrams: number;
  foodName: string;
}

// --- Nutrition Label Parsing (REST) ---

/** Response from POST /api/nutrition/label/parse */
export interface ParsedNutritionLabelResponse {
  name: string | null;
  brandName: string | null;
  servingSize: number | null;
  servingUnit: string | null;
  servingSizeAlt: number | null;
  servingSizeAltUnit: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  sodiumMg: number | null;
  cholesterolMg: number | null;
  fiberG: number | null;
  sugarG: number | null;
  saturatedFatG: number | null;
  transFatG: number | null;
  potassiumMg: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  vitaminDMcg: number | null;
  addedSugarG: number | null;
}

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

// Phase 2 — Disambiguation
export interface GeminiDisambiguateChoiceIntent {
  action: "DISAMBIGUATE_CHOICE";
  payload: { targetItem: string; choice: number | string };
}

// Phase 3 — Power User Flows
export interface GeminiCreateFoodDirectlyIntent {
  action: "CREATE_FOOD_DIRECTLY";
  payload: { name: string };
}

export interface GeminiClearAllIntent {
  action: "CLEAR_ALL";
  payload: null;
}

// Phase 4 — History
export interface GeminiQueryHistoryIntent {
  action: "QUERY_HISTORY";
  payload: {
    datePhrase: string;
    mealLabel?: MealLabel;
    addToDraft?: boolean;
  };
}

// Phase 5 — Grounded AI Information
export interface GeminiQueryRemainingIntent {
  action: "QUERY_REMAINING";
  payload: null;
}

export interface GeminiLookupFoodInfoIntent {
  action: "LOOKUP_FOOD_INFO";
  payload: { query: string };
}

export interface GeminiSuggestFoodsIntent {
  action: "SUGGEST_FOODS";
  payload: null;
}

// Phase 6 — Bounded AI Estimates
export interface GeminiEstimateFoodIntent {
  action: "ESTIMATE_FOOD";
  payload: { name: string; quantity?: number; unit?: string; context?: string };
}

export interface GeminiConfirmFoodCreationIntent {
  action: "CONFIRM_FOOD_CREATION";
  payload: {
    saveMode: "community" | "private" | "cancel";
    quantity?: number;
    unit?: string;
  };
}

// Scale integration
export interface GeminiScaleConfirmIntent {
  action: "SCALE_CONFIRM";
  payload: { targetItem?: string }; // omit or null → means active item
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
  | GeminiRedoIntent
  | GeminiDisambiguateChoiceIntent
  | GeminiCreateFoodDirectlyIntent
  | GeminiClearAllIntent
  | GeminiQueryHistoryIntent
  | GeminiQueryRemainingIntent
  | GeminiLookupFoodInfoIntent
  | GeminiSuggestFoodsIntent
  | GeminiEstimateFoodIntent
  | GeminiConfirmFoodCreationIntent
  | GeminiScaleConfirmIntent;

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
  sessionState:
    | "normal"
    | `creating:${string}`
    | `confirming:${string}`
    | `awaiting_choice:${string}`
    | `usda_pending:${string}`
    | `disambiguating:${string}`
    | `confirm_clear_pending`
    | `estimate_pending:${string}`; // "creating:tmp-3" when mid-creation
  creatingFoodProgress?: CreatingFoodProgress;
}
