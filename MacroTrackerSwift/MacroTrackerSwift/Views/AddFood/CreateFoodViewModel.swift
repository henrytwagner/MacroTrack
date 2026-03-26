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
            servingSizeText  = Self.fmt(food.servingSize)
            servingUnit      = food.servingUnit
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
            servingSizeText  = Self.fmt(food.defaultServingSize)
            servingUnit      = food.defaultServingUnit
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
            servingSizeText  = Self.fmt(food.servingSize)
            servingUnit      = food.servingUnit
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

    // MARK: - Helper

    private static func fmt(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(v))
            : String(format: "%.1f", v)
    }
}
