import Foundation
import Observation

// MARK: - PublishMode

enum PublishMode: Sendable, Equatable {
    case personal
    case community
}

// MARK: - CreateFoodMode

enum CreateFoodMode: Sendable {
    case new(prefillName: String?, prefillBarcode: String?)
    case editCustom(CustomFood)
    case editCommunity(CommunityFood)
    case publishFromCustom(CustomFood)
}

// MARK: - CreateFoodViewModel

@Observable @MainActor
final class CreateFoodViewModel {

    let mode: CreateFoodMode

    // Form fields (all String for TextField binding, parsed at save time)
    var name:             String = ""
    var brandName:        String = ""
    var servingSizeText:  String = ""
    var servingUnit:      String = "g"
    var caloriesText:     String = ""
    var proteinText:      String = ""
    var carbsText:        String = ""
    var fatText:          String = ""
    var sodiumText:       String = ""
    var cholesterolText:  String = ""
    var fiberText:        String = ""
    var sugarText:        String = ""
    var saturatedFatText: String = ""
    var transFatText:     String = ""
    var barcode:          String = ""
    var publishMode:      PublishMode = .personal

    var pendingConversions: [PendingUnitConversion] = []
    var overlayPanel:       FoodUnitConversionPanel = .idle

    var isSaving: Bool   = false
    var saveError: String? = nil

    var navigationTitle: String {
        switch mode {
        case .new:               return "Create Food"
        case .editCustom:        return "Edit Food"
        case .editCommunity:     return "Edit Community Food"
        case .publishFromCustom: return "Publish to Community"
        }
    }

    var saveButtonTitle: String {
        switch mode {
        case .new:
            return publishMode == .community ? "Publish" : "Save"
        case .editCustom, .editCommunity:
            return "Save"
        case .publishFromCustom:
            return "Publish"
        }
    }

    // MARK: - Init

    init(mode: CreateFoodMode) {
        self.mode = mode
        switch mode {
        case .new(let prefillName, let prefillBarcode):
            name    = prefillName ?? ""
            barcode = prefillBarcode.map { GTINNormalizer.normalizeToGTIN($0) } ?? ""

        case .editCustom(let food):
            name             = food.name
            brandName        = food.brandName ?? ""
            servingUnit      = food.servingUnit
            servingSizeText  = formatQuantity(food.servingSize, unit: food.servingUnit)
            caloriesText     = Self.fmt(food.calories)
            proteinText      = Self.fmt(food.proteinG)
            carbsText        = Self.fmt(food.carbsG)
            fatText          = Self.fmt(food.fatG)
            sodiumText       = food.sodiumMg.map       { Self.fmt($0) } ?? ""
            cholesterolText  = food.cholesterolMg.map  { Self.fmt($0) } ?? ""
            fiberText        = food.fiberG.map         { Self.fmt($0) } ?? ""
            sugarText        = food.sugarG.map         { Self.fmt($0) } ?? ""
            saturatedFatText = food.saturatedFatG.map  { Self.fmt($0) } ?? ""
            transFatText     = food.transFatG.map      { Self.fmt($0) } ?? ""
            barcode          = food.barcode ?? ""

        case .editCommunity(let food):
            publishMode      = .community
            name             = food.name
            brandName        = food.brandName ?? ""
            servingUnit      = food.defaultServingUnit
            servingSizeText  = formatQuantity(food.defaultServingSize, unit: food.defaultServingUnit)
            caloriesText     = Self.fmt(food.calories)
            proteinText      = Self.fmt(food.proteinG)
            carbsText        = Self.fmt(food.carbsG)
            fatText          = Self.fmt(food.fatG)
            sodiumText       = food.sodiumMg.map       { Self.fmt($0) } ?? ""
            cholesterolText  = food.cholesterolMg.map  { Self.fmt($0) } ?? ""
            fiberText        = food.fiberG.map         { Self.fmt($0) } ?? ""
            sugarText        = food.sugarG.map         { Self.fmt($0) } ?? ""
            saturatedFatText = food.saturatedFatG.map  { Self.fmt($0) } ?? ""
            transFatText     = food.transFatG.map      { Self.fmt($0) } ?? ""
            barcode          = food.barcode ?? ""

        case .publishFromCustom(let food):
            name             = food.name
            brandName        = food.brandName ?? ""
            servingUnit      = food.servingUnit
            servingSizeText  = formatQuantity(food.servingSize, unit: food.servingUnit)
            caloriesText     = Self.fmt(food.calories)
            proteinText      = Self.fmt(food.proteinG)
            carbsText        = Self.fmt(food.carbsG)
            fatText          = Self.fmt(food.fatG)
            barcode          = food.barcode ?? ""
            publishMode      = .community
        }
    }

    // MARK: - Validation

    var isValid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
        && Double(servingSizeText) != nil
        && Double(caloriesText) != nil
        && Double(proteinText) != nil
        && Double(carbsText) != nil
        && Double(fatText) != nil
    }

    // MARK: - Save

    /// Returns the saved CustomFood on success (nil for publish-only).
    @discardableResult
    func save() async throws -> CustomFood? {
        isSaving = true
        defer { isSaving = false }

        let servingSize = Double(servingSizeText) ?? 0
        let calories    = Double(caloriesText) ?? 0
        let protein     = Double(proteinText)  ?? 0
        let carbs       = Double(carbsText)    ?? 0
        let fat         = Double(fatText)      ?? 0

        // Normalize barcode to GTIN-13 before sending to server.
        // For create requests, nil means "no barcode."
        // For update requests, we need to distinguish "no change" from "clear barcode."
        // Since all fields are always populated from the existing food on edit,
        // we always send the barcode value (empty string → server sets null).
        let normalizedBarcode: String? = barcode.isEmpty
            ? nil
            : GTINNormalizer.normalizeToGTIN(barcode)
        // For edit modes, explicitly include barcode so the server applies the change
        // (nil would omit the key from JSON, making server skip the update).
        let editBarcode: String? = barcode.isEmpty ? "" : normalizedBarcode

        switch mode {
        case .new:
            if publishMode == .community {
                let req = CreateCommunityFoodRequest(
                    name:               name,
                    brandName:          brandName.isEmpty ? nil : brandName,
                    description:        nil,
                    defaultServingSize: servingSize,
                    defaultServingUnit: servingUnit,
                    calories:           calories,
                    proteinG:           protein,
                    carbsG:             carbs,
                    fatG:               fat,
                    sodiumMg:           Double(sodiumText),
                    cholesterolMg:      Double(cholesterolText),
                    fiberG:             Double(fiberText),
                    sugarG:             Double(sugarText),
                    saturatedFatG:      Double(saturatedFatText),
                    transFatG:          Double(transFatText),
                    barcode:            normalizedBarcode,
                    barcodeType:        nil)
                _ = try await APIClient.shared.createCommunityFood(req)
                return nil
            } else {
                let req = CreateCustomFoodRequest(
                    name:          name,
                    brandName:     brandName.isEmpty ? nil : brandName,
                    servingSize:   servingSize,
                    servingUnit:   servingUnit,
                    calories:      calories,
                    proteinG:      protein,
                    carbsG:        carbs,
                    fatG:          fat,
                    sodiumMg:      Double(sodiumText),
                    cholesterolMg: Double(cholesterolText),
                    fiberG:        Double(fiberText),
                    sugarG:        Double(sugarText),
                    saturatedFatG: Double(saturatedFatText),
                    transFatG:     Double(transFatText),
                    barcode:       normalizedBarcode)
                let food = try await APIClient.shared.createCustomFood(req)
                // Save pending unit conversions
                for conv in pendingConversions {
                    let convReq = CreateFoodUnitConversionRequest(
                        unitName:               conv.unitName,
                        quantityInBaseServings: conv.quantityInBaseServings,
                        customFoodId:           food.id,
                        usdaFdcId:              nil,
                        measurementSystem:      nil)
                    _ = try? await APIClient.shared.createFoodUnitConversion(convReq)
                }
                return food
            }

        case .editCustom(let existing):
            let req = UpdateCustomFoodRequest(
                name:          name,
                brandName:     brandName.isEmpty ? nil : brandName,
                servingSize:   servingSize,
                servingUnit:   servingUnit,
                calories:      calories,
                proteinG:      protein,
                carbsG:        carbs,
                fatG:          fat,
                sodiumMg:      Double(sodiumText),
                cholesterolMg: Double(cholesterolText),
                fiberG:        Double(fiberText),
                sugarG:        Double(sugarText),
                saturatedFatG: Double(saturatedFatText),
                transFatG:     Double(transFatText),
                barcode:       editBarcode)
            return try await APIClient.shared.updateCustomFood(id: existing.id, data: req)

        case .editCommunity(let existing):
            let req = CreateCommunityFoodRequest(
                name:               name,
                brandName:          brandName.isEmpty ? nil : brandName,
                description:        nil,
                defaultServingSize: servingSize,
                defaultServingUnit: servingUnit,
                calories:           calories,
                proteinG:           protein,
                carbsG:             carbs,
                fatG:               fat,
                sodiumMg:           Double(sodiumText),
                cholesterolMg:      Double(cholesterolText),
                fiberG:             Double(fiberText),
                sugarG:             Double(sugarText),
                saturatedFatG:      Double(saturatedFatText),
                transFatG:          Double(transFatText),
                barcode:            editBarcode,
                barcodeType:        nil)
            _ = try await APIClient.shared.updateCommunityFood(id: existing.id, data: req)
            return nil

        case .publishFromCustom(let food):
            let req = PublishCustomFoodRequest(
                brandName:   brandName.isEmpty ? nil : brandName,
                barcode:     editBarcode,
                barcodeType: nil)
            _ = try await APIClient.shared.publishCustomFood(id: food.id, data: req)
            return nil
        }
    }

    // MARK: - Prefill from Nutrition Label

    /// Populate form fields from a parsed nutrition label.
    /// Call immediately after init with `.new(...)` mode.
    func prefill(from label: ParsedNutritionLabel) {
        if let n = label.name { name = n }
        if let b = label.brandName { brandName = b }
        servingUnit     = label.servingSize.canonicalUnit
        servingSizeText = formatQuantity(label.servingSize.canonicalQuantity, unit: label.servingSize.canonicalUnit)
        if let v = label.calories { caloriesText = Self.fmt(v) }
        if let v = label.proteinG { proteinText  = Self.fmt(v) }
        if let v = label.carbsG   { carbsText    = Self.fmt(v) }
        if let v = label.fatG     { fatText      = Self.fmt(v) }
        if let v = label.sodiumMg       { sodiumText       = Self.fmt(v) }
        if let v = label.cholesterolMg  { cholesterolText  = Self.fmt(v) }
        if let v = label.fiberG         { fiberText        = Self.fmt(v) }
        if let v = label.sugarG         { sugarText        = Self.fmt(v) }
        if let v = label.saturatedFatG  { saturatedFatText = Self.fmt(v) }
        if let v = label.transFatG      { transFatText     = Self.fmt(v) }

        // If the label listed a secondary unit (e.g. "1 cup (240mL)"), add a pending
        // unit conversion so the user can log in that unit later.
        //
        // qibs semantics: 1 origUnit = qibs base servings.
        // origQty original units = 1 base serving, therefore:
        //   qibs = 1 / origQty
        //
        // Examples:
        //   "1 cup (240mL)"  → origQty=1  → qibs=1.0  (1 cup  = 1 serving)
        //   "2 tbsp (30g)"   → origQty=2  → qibs=0.5  (1 tbsp = 0.5 servings)
        //   "0.5 cup (120mL)"→ origQty=0.5→ qibs=2.0  (1 cup  = 2 servings)
        if let origQty = label.servingSize.originalQuantity,
           let origUnit = label.servingSize.originalUnit,
           origUnit != label.servingSize.canonicalUnit,
           origQty > 0 {
            let qibs = 1.0 / origQty
            pendingConversions.append(PendingUnitConversion(
                unitName: origUnit,
                quantityInBaseServings: qibs))
        }
    }

    // MARK: - Helper

    private static func fmt(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(v))
            : String(format: "%.1f", v)
    }
}
