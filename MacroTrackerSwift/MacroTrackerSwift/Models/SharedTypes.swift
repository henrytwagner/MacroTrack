// ============================================================
// MacroTrack — Shared Type Definitions (Swift port of shared/types.ts)
// ============================================================

import Foundation

// MARK: - Enums

enum FoodSource: String, Codable, Sendable {
    case database = "DATABASE"
    case custom   = "CUSTOM"
    case community = "COMMUNITY"
    // AI_ESTIMATE intentionally omitted — see CLAUDE.md
}

enum MealLabel: String, Codable, Sendable, CaseIterable {
    case breakfast, lunch, dinner, snack
}

enum SessionStatus: String, Codable, Sendable {
    case active, completed, cancelled
}

enum NutritionUnit: String, Codable, Sendable {
    case g, oz, cups, servings, slices, pieces, ml
    case tbsp, tsp
    case flOz    = "fl oz"
    case L, portion, can, bottle, packet, clove, scoop
}

// MARK: - Core Domain Models

struct Macros: Codable, Sendable, Equatable {
    var calories: Double
    var proteinG: Double
    var carbsG:   Double
    var fatG:     Double

    static let zero = Macros(calories: 0, proteinG: 0, carbsG: 0, fatG: 0)
}

struct ExtendedNutrition: Codable, Sendable {
    var sodiumMg:       Double?
    var cholesterolMg:  Double?
    var fiberG:         Double?
    var sugarG:         Double?
    var saturatedFatG:  Double?
    var transFatG:      Double?
}

struct DailyGoal: Codable, Identifiable, Sendable {
    var id:        String
    var calories:  Double
    var proteinG:  Double
    var carbsG:    Double
    var fatG:      Double
}

// MARK: - User Profile & Goals

enum Sex: String, Codable, Sendable {
    case male        = "MALE"
    case female      = "FEMALE"
    case unspecified = "UNSPECIFIED"
}

enum ActivityLevel: String, Codable, Sendable {
    case sedentary = "SEDENTARY"
    case light     = "LIGHT"
    case moderate  = "MODERATE"
    case high      = "HIGH"
    case veryHigh  = "VERY_HIGH"
}

enum UnitSystem: String, Codable, Sendable {
    case metric   = "METRIC"
    case imperial = "IMPERIAL"
}

enum GoalType: String, Codable, Sendable {
    case cut      = "CUT"
    case maintain = "MAINTAIN"
    case gain     = "GAIN"
}

enum GoalAggressiveness: String, Codable, Sendable {
    case mild       = "MILD"
    case standard   = "STANDARD"
    case aggressive = "AGGRESSIVE"
}

struct UserProfile: Codable, Sendable {
    var heightCm:             Double?
    var weightKg:             Double?
    var sex:                  Sex
    var dateOfBirth:          String?
    var ageYears:             Int?
    var activityLevel:        ActivityLevel?
    var preferredUnits:       UnitSystem
    var currentGoalProfileId: String?
}

struct UserPreferences: Codable, Sendable {
    var suppressUsdaWarning: Bool
}

// MARK: - Custom Foods

struct CustomFood: Codable, Identifiable, Sendable {
    var id:              String
    var name:            String
    var brandName:       String?
    var servingSize:     Double
    var servingUnit:     String
    var calories:        Double
    var proteinG:        Double
    var carbsG:          Double
    var fatG:            Double
    var sodiumMg:        Double?
    var cholesterolMg:   Double?
    var fiberG:          Double?
    var sugarG:          Double?
    var saturatedFatG:   Double?
    var transFatG:       Double?
    var barcode:         String?
    var createdAt:       String
    var updatedAt:       String
}

enum CommunityFoodStatus: String, Codable, Sendable {
    case active  = "ACTIVE"
    case pending = "PENDING"
    case retired = "RETIRED"
}

struct CommunityFood: Codable, Identifiable, Sendable {
    var id:                String
    var name:              String
    var brandName:         String?
    var description:       String?
    var defaultServingSize: Double
    var defaultServingUnit: String
    var calories:          Double
    var proteinG:          Double
    var carbsG:            Double
    var fatG:              Double
    var sodiumMg:          Double?
    var cholesterolMg:     Double?
    var fiberG:            Double?
    var sugarG:            Double?
    var saturatedFatG:     Double?
    var transFatG:         Double?
    var usdaFdcId:         Int?
    var createdByUserId:   String?
    var status:            CommunityFoodStatus
    var usesCount:         Int
    var reportsCount:      Int
    var trustScore:        Double
    var lastUsedAt:        String?
    var createdAt:         String
    var updatedAt:         String
}

enum MeasurementSystem: String, Codable, Sendable {
    case weight, volume, abstract
}

struct FoodUnitConversion: Codable, Identifiable, Sendable {
    var id:                       String
    var unitName:                 String
    var quantityInBaseServings:   Double
    var customFoodId:             String?
    var usdaFdcId:                Int?
    var measurementSystem:        MeasurementSystem
}

// MARK: - Food Entry

struct FoodEntry: Codable, Identifiable, Sendable {
    var id:              String
    var date:            String
    var mealLabel:       MealLabel
    var name:            String
    var quantity:        Double
    var unit:            String
    var calories:        Double
    var proteinG:        Double
    var carbsG:          Double
    var fatG:            Double
    var source:          FoodSource
    var usdaFdcId:       Int?
    var customFoodId:    String?
    var communityFoodId: String?
    var createdAt:       String
}

// MARK: - USDA

struct USDASearchResult: Codable, Sendable {
    var fdcId:           Int
    var description:     String
    var brandName:       String?
    var servingSize:     Double?
    var servingSizeUnit: String?
    var macros:          Macros
    var usesCount:       Int?
}

// MARK: - Search

struct UnifiedSearchResponse: Codable, Sendable {
    var myFoods:   [CustomFood]
    var community: [CommunityFood]
    var database:  [USDASearchResult]
}

struct FrequentFood: Codable, Sendable {
    var name:            String
    var source:          FoodSource
    var lastQuantity:    Double
    var lastUnit:        String
    var macros:          Macros
    var usdaFdcId:       Int?
    var customFoodId:    String?
    var communityFoodId: String?
    var logCount:        Int
}

struct RecentFood: Codable, Sendable {
    var name:            String
    var source:          FoodSource
    var quantity:        Double
    var unit:            String
    var macros:          Macros
    var usdaFdcId:       Int?
    var customFoodId:    String?
    var communityFoodId: String?
    var loggedAt:        String
}

// MARK: - API Request / Response Types

struct CreateFoodEntryRequest: Codable, Sendable {
    var date:            String
    var name:            String
    var calories:        Double
    var proteinG:        Double
    var carbsG:          Double
    var fatG:            Double
    var quantity:        Double
    var unit:            String
    var source:          FoodSource
    var mealLabel:       MealLabel
    var usdaFdcId:       Int?
    var customFoodId:    String?
    var communityFoodId: String?
}

struct UpdateFoodEntryRequest: Codable, Sendable {
    var quantity:  Double?
    var unit:      String?
    var calories:  Double?
    var proteinG:  Double?
    var carbsG:    Double?
    var fatG:      Double?
}

struct CreateCustomFoodRequest: Codable, Sendable {
    var name:           String
    var brandName:      String?
    var servingSize:    Double
    var servingUnit:    String
    var calories:       Double
    var proteinG:       Double
    var carbsG:         Double
    var fatG:           Double
    var sodiumMg:       Double?
    var cholesterolMg:  Double?
    var fiberG:         Double?
    var sugarG:         Double?
    var saturatedFatG:  Double?
    var transFatG:      Double?
    var barcode:        String?
}

struct UpdateCustomFoodRequest: Codable, Sendable {
    var name:           String?
    var brandName:      String?
    var servingSize:    Double?
    var servingUnit:    String?
    var calories:       Double?
    var proteinG:       Double?
    var carbsG:         Double?
    var fatG:           Double?
    var sodiumMg:       Double?
    var cholesterolMg:  Double?
    var fiberG:         Double?
    var sugarG:         Double?
    var saturatedFatG:  Double?
    var transFatG:      Double?
    var barcode:        String?
}

struct CreateCommunityFoodRequest: Codable, Sendable {
    var name:               String
    var brandName:          String?
    var description:        String?
    var defaultServingSize: Double
    var defaultServingUnit: String
    var calories:           Double
    var proteinG:           Double
    var carbsG:             Double
    var fatG:               Double
    var sodiumMg:           Double?
    var cholesterolMg:      Double?
    var fiberG:             Double?
    var sugarG:             Double?
    var saturatedFatG:      Double?
    var transFatG:          Double?
    var barcode:            String?
    var barcodeType:        String?
}

struct PublishCustomFoodRequest: Codable, Sendable {
    var brandName:   String?
    var barcode:     String?
    var barcodeType: String?
}

struct UpdateGoalsRequest: Codable, Sendable {
    var calories: Double
    var proteinG: Double
    var carbsG:   Double
    var fatG:     Double
}

struct GoalProfileSummary: Codable, Sendable {
    var id:              String
    var name:            String
    var goalType:        GoalType
    var aggressiveness:  GoalAggressiveness
    var effectiveDate:   String
}

struct GoalForDateResponse: Codable, Sendable {
    var date:    String
    var goals:   DailyGoal?
    var profile: GoalProfileSummary?
}

struct UpdateGoalsForDateRequest: Codable, Sendable {
    var effectiveDate:   String
    var macros:          Macros
    var goalType:        GoalType
    var aggressiveness:  GoalAggressiveness
    var profileId:       String?
    var newProfileName:  String?
}

struct GoalProfileListItem: Codable, Identifiable, Sendable {
    var id:                String
    var name:              String
    var createdAt:         String
    var archivedAt:        String?
    var lastEffectiveDate: String?
}

struct GoalProfilesResponse: Codable, Sendable {
    var profiles: [GoalProfileListItem]
}

// MARK: - FoodUnitConversion Requests

struct CreateFoodUnitConversionRequest: Codable, Sendable {
    var unitName:               String
    var quantityInBaseServings: Double
    var customFoodId:           String?
    var usdaFdcId:              Int?
    var measurementSystem:      MeasurementSystem?
}

struct UpdateFoodUnitConversionRequest: Codable, Sendable {
    var quantityInBaseServings: Double?
}

struct CascadeUnitConversionsRequest: Codable, Sendable {
    struct Update: Codable, Sendable {
        var id:                       String
        var quantityInBaseServings:   Double
    }
    var updates: [Update]
}

// MARK: - Barcode

struct BarcodeScanResult: Codable, Sendable {
    var gtin:   String
    var raw:    String
    var format: String
}

enum BarcodeLookupResult: Decodable, Sendable {
    case community(food: CommunityFood)
    case custom(food: CustomFood)
    case notFound

    private enum CodingKeys: String, CodingKey { case source, food }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let source = try c.decodeIfPresent(String.self, forKey: .source)
        switch source {
        case "community":
            let food = try c.decode(CommunityFood.self, forKey: .food)
            self = .community(food: food)
        case "custom":
            let food = try c.decode(CustomFood.self, forKey: .food)
            self = .custom(food: food)
        default:
            self = .notFound
        }
    }
}

// MARK: - Kitchen Mode Draft State

enum DraftCardState: String, Codable, Sendable {
    case normal
    case clarifying
    case creating
    case confirming
    case choice
    case usdaPending           = "usda_pending"
    case disambiguate
    case confirmClear          = "confirm_clear"
    case communitySubmitPrompt = "community_submit_prompt"
    case historyResults        = "history_results"
    case macroSummary          = "macro_summary"
    case foodInfo              = "food_info"
    case foodSuggestions       = "food_suggestions"
    case estimateCard          = "estimate_card"
}

enum CreatingFoodField: String, Codable, Sendable {
    case confirm, servingSize, calories, protein, carbs, fat, brand, barcode, complete
}

struct CreatingFoodProgress: Codable, Sendable {
    var servingSize:  Double?
    var servingUnit:  String?
    var calories:     Double?
    var proteinG:     Double?
    var carbsG:       Double?
    var fatG:         Double?
    var brand:        String?
    var barcode:      String?
    var currentField: CreatingFoodField
}

struct DisambiguationOption: Codable, Sendable {
    var label:      String
    var usdaResult: USDASearchResult
}

struct HistoryFoodEntry: Codable, Sendable {
    var name:     String
    var quantity: Double
    var unit:     String
    var macros:   Macros
}

struct MacroSummary: Codable, Sendable {
    var calories: Double
    var proteinG: Double
    var carbsG:   Double
    var fatG:     Double
    var goals:    Macros?
}

struct DraftItem: Codable, Identifiable, Sendable {
    var id:              String
    var name:            String
    var quantity:        Double
    var unit:            String
    var calories:        Double
    var proteinG:        Double
    var carbsG:          Double
    var fatG:            Double
    var source:          FoodSource
    var usdaFdcId:       Int?
    var customFoodId:    String?
    var communityFoodId: String?
    var mealLabel:       MealLabel
    var state:           DraftCardState
    var clarifyQuestion:        String?
    var creatingProgress:       CreatingFoodProgress?
    var initialQuantity:        Double?
    var initialUnit:            String?
    var confirmingData:         ConfirmingData?
    var isAssumed:              Bool?
    var isEstimate:             Bool?
    var estimateConfidence:     String?
    var disambiguationOptions:  [DisambiguationOption]?
    var historyData:            HistoryData?

    struct ConfirmingData: Codable, Sendable {
        var quantityMismatch:  Bool
        var collectedValues:   CreatingFoodProgress
    }

    struct HistoryData: Codable, Sendable {
        var dateLabel:    String
        var entries:      [HistoryFoodEntry]
        var totals:       Macros
        var addedToDraft: Bool
    }
}

// MARK: - AnyFood

/// Unifying enum over all three food sources. No retroactive conformance hacks; exhaustive switch.
enum AnyFood: Sendable {
    case custom(CustomFood)
    case community(CommunityFood)
    case usda(USDASearchResult)

    var displayName: String {
        switch self {
        case .custom(let f):    return f.name
        case .community(let f): return f.brandName.map { "\($0) — \(f.name)" } ?? f.name
        case .usda(let f):      return f.description
        }
    }

    var baseServingSize: Double {
        switch self {
        case .custom(let f):    return f.servingSize
        case .community(let f): return f.defaultServingSize
        case .usda(let f):      return f.servingSize ?? 100
        }
    }

    var baseServingUnit: String {
        switch self {
        case .custom(let f):    return f.servingUnit
        case .community(let f): return f.defaultServingUnit
        case .usda(let f):      return f.servingSizeUnit ?? "g"
        }
    }

    var baseMacros: Macros {
        switch self {
        case .custom(let f):
            return Macros(calories: f.calories, proteinG: f.proteinG, carbsG: f.carbsG, fatG: f.fatG)
        case .community(let f):
            return Macros(calories: f.calories, proteinG: f.proteinG, carbsG: f.carbsG, fatG: f.fatG)
        case .usda(let f):
            return f.macros
        }
    }

    var foodSource: FoodSource {
        switch self {
        case .custom:    return .custom
        case .community: return .community
        case .usda:      return .database
        }
    }

    var asCustomFood: CustomFood? {
        guard case .custom(let f) = self else { return nil }
        return f
    }

    var asCommunityFood: CommunityFood? {
        guard case .community(let f) = self else { return nil }
        return f
    }

    var asUSDA: USDASearchResult? {
        guard case .usda(let f) = self else { return nil }
        return f
    }
}

// MARK: - IdentifiedFood

/// Identifiable wrapper for AnyFood — keeps .sheet(item:) clean
/// since AnyFood's three subtypes have different ID types.
struct IdentifiedFood: Identifiable, Sendable {
    let id = UUID()
    let food: AnyFood
}

// MARK: - PendingUnitConversion

/// Draft conversion used before a food ID exists (CreateFoodSheet).
struct PendingUnitConversion: Identifiable, Sendable {
    var id = UUID()
    var unitName: String
    var quantityInBaseServings: Double
}

// MARK: - FoodUnitConversionPanel

/// Overlay state machine shared between FoodDetailSheet and CreateFoodSheet.
enum FoodUnitConversionPanel: Equatable, Sendable {
    case idle
    case preview                        // list-all (FoodDetailSheet)
    case unitPreview(unitName: String)  // per-unit compact card (CreateFoodSheet)
    case picking
    case form(editingUnit: String?)     // nil = new, non-nil = editing existing
}

// MARK: - Free Functions

/// Scale factor relative to one base serving.
/// - If a named conversion exists: `quantity × conversion.quantityInBaseServings`
/// - If unit == "servings": `quantity`
/// - Otherwise (weight/volume base unit): `quantity / baseServing.size`
nonisolated func scaleFactorForQuantity(
    quantity: Double,
    unit: String,
    baseServing: (size: Double, unit: String),
    conversion: FoodUnitConversion?
) -> Double {
    if let conv = conversion {
        return quantity * conv.quantityInBaseServings
    }
    if unit.lowercased() == "servings" {
        return quantity
    }
    guard baseServing.size > 0 else { return 1 }
    return quantity / baseServing.size
}

/// Returns the appropriate meal label for the current time of day.
nonisolated func currentMealLabel() -> MealLabel {
    let hour = Calendar.current.component(.hour, from: Date())
    if hour >= 5  && hour < 11 { return .breakfast }
    if hour >= 11 && hour < 14 { return .lunch }
    if hour >= 14 && hour < 17 { return .snack }
    if hour >= 17 && hour < 22 { return .dinner }
    return .snack
}

// MARK: - WebSocket Messages (Client → Server)

enum WSClientMessage: Encodable, Sendable {
    case transcript(text: String)
    case audioChunk(data: String, sequence: Int)
    case save
    case cancel
    case barcodeScan(gtin: String)
    case scaleConfirm(itemId: String, quantity: Double, unit: String)

    private enum CodingKeys: String, CodingKey {
        case type, text, data, sequence, gtin, itemId, quantity, unit
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .transcript(let text):
            try c.encode("transcript", forKey: .type)
            try c.encode(text, forKey: .text)
        case .audioChunk(let data, let sequence):
            try c.encode("audio_chunk", forKey: .type)
            try c.encode(data, forKey: .data)
            try c.encode(sequence, forKey: .sequence)
        case .save:
            try c.encode("save", forKey: .type)
        case .cancel:
            try c.encode("cancel", forKey: .type)
        case .barcodeScan(let gtin):
            try c.encode("barcode_scan", forKey: .type)
            try c.encode(gtin, forKey: .gtin)
        case .scaleConfirm(let itemId, let quantity, let unit):
            try c.encode("scale_confirm", forKey: .type)
            try c.encode(itemId, forKey: .itemId)
            try c.encode(quantity, forKey: .quantity)
            try c.encode(unit, forKey: .unit)
        }
    }
}

// MARK: - WebSocket Messages (Server → Client)

enum WSServerMessage: Decodable, Sendable {
    case itemsAdded(items: [DraftItem])
    case itemEdited(itemId: String, changes: ItemChanges)
    case itemRemoved(itemId: String)
    case clarify(itemId: String, question: String)
    case createFoodPrompt(itemId: String, foodName: String, question: String)
    case createFoodField(itemId: String, foodName: String, field: CreatingFoodField,
                         question: String, collectedValues: CreatingFoodProgress?)
    case createFoodComplete(item: DraftItem)
    case createFoodConfirm(itemId: String, foodName: String,
                           collectedValues: CreatingFoodProgress,
                           initialQuantity: Double?, initialUnit: String?,
                           quantityMismatch: Bool)
    case foodChoice(itemId: String, foodName: String, question: String)
    case usdaConfirm(itemId: String, usdaDescription: String, question: String,
                     usdaResult: USDASearchResult)
    case openBarcodeScanner
    case ask(question: String)
    case error(message: String)
    case sessionSaved(entriesCount: Int)
    case sessionCancelled
    case draftReplaced(draft: [DraftItem], message: String)
    case operationCancelled(itemId: String, message: String)
    case disambiguate(itemId: String, foodName: String, question: String,
                      options: [DisambiguationOption])
    case confirmClear(question: String)
    case communitySubmitPrompt(itemId: String, foodName: String, question: String)
    case historyResults(itemId: String, dateLabel: String, mealLabel: MealLabel?,
                        entries: [HistoryFoodEntry], totals: Macros, addedToDraft: Bool)
    case macroSummary(itemId: String, summary: MacroSummary)
    case foodInfo(itemId: String, foodName: String, usdaResult: USDASearchResult,
                  question: String?)
    case foodSuggestions(itemId: String, suggestions: [FoodSuggestion])
    case estimateCard(item: DraftItem, canAddAnyway: Bool)
    case promptScaleConfirm(itemId: String)

    struct ItemChanges: Decodable, Sendable {
        var name:      String?
        var quantity:  Double?
        var unit:      String?
        var calories:  Double?
        var proteinG:  Double?
        var carbsG:    Double?
        var fatG:      Double?
        var isAssumed: Bool?
    }

    struct FoodSuggestion: Codable, Sendable {
        var name:   String
        var macros: Macros
        var reason: String
    }

    private enum CodingKeys: String, CodingKey {
        case type, items, itemId, changes, question, foodName, field, collectedValues
        case item, initialQuantity, initialUnit, quantityMismatch
        case usdaDescription, usdaResult, message, draft, options
        case dateLabel, mealLabel, entries, totals, addedToDraft
        case summary, suggestions, canAddAnyway, entriesCount
    }

    init(from decoder: Decoder) throws {
        let c    = try decoder.container(keyedBy: CodingKeys.self)
        let type = try c.decode(String.self, forKey: .type)

        switch type {
        case "items_added":
            self = .itemsAdded(items: try c.decode([DraftItem].self, forKey: .items))

        case "item_edited":
            self = .itemEdited(
                itemId:  try c.decode(String.self, forKey: .itemId),
                changes: try c.decode(ItemChanges.self, forKey: .changes))

        case "item_removed":
            self = .itemRemoved(itemId: try c.decode(String.self, forKey: .itemId))

        case "clarify":
            self = .clarify(
                itemId:   try c.decode(String.self, forKey: .itemId),
                question: try c.decode(String.self, forKey: .question))

        case "create_food_prompt":
            self = .createFoodPrompt(
                itemId:   try c.decode(String.self, forKey: .itemId),
                foodName: try c.decode(String.self, forKey: .foodName),
                question: try c.decode(String.self, forKey: .question))

        case "create_food_field":
            self = .createFoodField(
                itemId:          try c.decode(String.self, forKey: .itemId),
                foodName:        try c.decode(String.self, forKey: .foodName),
                field:           try c.decode(CreatingFoodField.self, forKey: .field),
                question:        try c.decode(String.self, forKey: .question),
                collectedValues: try c.decodeIfPresent(CreatingFoodProgress.self, forKey: .collectedValues))

        case "create_food_complete":
            self = .createFoodComplete(item: try c.decode(DraftItem.self, forKey: .item))

        case "create_food_confirm":
            self = .createFoodConfirm(
                itemId:          try c.decode(String.self, forKey: .itemId),
                foodName:        try c.decode(String.self, forKey: .foodName),
                collectedValues: try c.decode(CreatingFoodProgress.self, forKey: .collectedValues),
                initialQuantity: try c.decodeIfPresent(Double.self, forKey: .initialQuantity),
                initialUnit:     try c.decodeIfPresent(String.self, forKey: .initialUnit),
                quantityMismatch: try c.decode(Bool.self, forKey: .quantityMismatch))

        case "food_choice":
            self = .foodChoice(
                itemId:   try c.decode(String.self, forKey: .itemId),
                foodName: try c.decode(String.self, forKey: .foodName),
                question: try c.decode(String.self, forKey: .question))

        case "usda_confirm":
            self = .usdaConfirm(
                itemId:          try c.decode(String.self, forKey: .itemId),
                usdaDescription: try c.decode(String.self, forKey: .usdaDescription),
                question:        try c.decode(String.self, forKey: .question),
                usdaResult:      try c.decode(USDASearchResult.self, forKey: .usdaResult))

        case "open_barcode_scanner":
            self = .openBarcodeScanner

        case "ask":
            self = .ask(question: try c.decode(String.self, forKey: .question))

        case "error":
            self = .error(message: try c.decode(String.self, forKey: .message))

        case "session_saved":
            self = .sessionSaved(entriesCount: try c.decode(Int.self, forKey: .entriesCount))

        case "session_cancelled":
            self = .sessionCancelled

        case "draft_replaced":
            self = .draftReplaced(
                draft:   try c.decode([DraftItem].self, forKey: .draft),
                message: try c.decode(String.self, forKey: .message))

        case "operation_cancelled":
            self = .operationCancelled(
                itemId:  try c.decode(String.self, forKey: .itemId),
                message: try c.decode(String.self, forKey: .message))

        case "disambiguate":
            self = .disambiguate(
                itemId:   try c.decode(String.self, forKey: .itemId),
                foodName: try c.decode(String.self, forKey: .foodName),
                question: try c.decode(String.self, forKey: .question),
                options:  try c.decode([DisambiguationOption].self, forKey: .options))

        case "confirm_clear":
            self = .confirmClear(question: try c.decode(String.self, forKey: .question))

        case "community_submit_prompt":
            self = .communitySubmitPrompt(
                itemId:   try c.decode(String.self, forKey: .itemId),
                foodName: try c.decode(String.self, forKey: .foodName),
                question: try c.decode(String.self, forKey: .question))

        case "history_results":
            self = .historyResults(
                itemId:       try c.decode(String.self, forKey: .itemId),
                dateLabel:    try c.decode(String.self, forKey: .dateLabel),
                mealLabel:    try c.decodeIfPresent(MealLabel.self, forKey: .mealLabel),
                entries:      try c.decode([HistoryFoodEntry].self, forKey: .entries),
                totals:       try c.decode(Macros.self, forKey: .totals),
                addedToDraft: try c.decode(Bool.self, forKey: .addedToDraft))

        case "macro_summary":
            self = .macroSummary(
                itemId:  try c.decode(String.self, forKey: .itemId),
                summary: try c.decode(MacroSummary.self, forKey: .summary))

        case "food_info":
            self = .foodInfo(
                itemId:     try c.decode(String.self, forKey: .itemId),
                foodName:   try c.decode(String.self, forKey: .foodName),
                usdaResult: try c.decode(USDASearchResult.self, forKey: .usdaResult),
                question:   try c.decodeIfPresent(String.self, forKey: .question))

        case "food_suggestions":
            self = .foodSuggestions(
                itemId:      try c.decode(String.self, forKey: .itemId),
                suggestions: try c.decode([FoodSuggestion].self, forKey: .suggestions))

        case "estimate_card":
            self = .estimateCard(
                item:         try c.decode(DraftItem.self, forKey: .item),
                canAddAnyway: try c.decode(Bool.self, forKey: .canAddAnyway))

        case "prompt_scale_confirm":
            self = .promptScaleConfirm(itemId: try c.decode(String.self, forKey: .itemId))

        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type, in: c,
                debugDescription: "Unknown WSServerMessage type: \(type)")
        }
    }
}
