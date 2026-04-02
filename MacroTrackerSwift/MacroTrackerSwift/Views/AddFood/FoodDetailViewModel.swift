import Foundation
import Observation

// MARK: - DetailMode

enum DetailMode: Sendable {
    case add
    case edit(FoodEntry)
}

// MARK: - FoodDetailViewModel

@Observable @MainActor
final class FoodDetailViewModel {

    let food: AnyFood
    let mode: DetailMode

    var quantityText:         String  = ""
    var selectedUnit:         String  = ""
    var conversions:          [FoodUnitConversion] = []
    var isLoadingConversions: Bool    = false
    var overlayPanel:         FoodUnitConversionPanel = .idle

    // USDA warning
    var showUsdaWarning:      Bool    = false
    var suppressUsdaWarning:  Bool    = false

    var isSaving:             Bool    = false
    var saveError:            String? = nil

    // MARK: - Scale Weighing State

    var scaleWeighingActive:  Bool    = false
    var confirmedViaScale:    Bool    = false

    // Software zero offset
    var zeroOffset:           Double? = nil
    var keepZeroOffset:       Bool    = false

    // Subtractive weighing
    var subtractiveStartWeight: Double? = nil
    var subtractiveStartUnit:   ScaleUnit? = nil

    // Stable macro preview (updates only on stable readings)
    var stableMacroPreview:   Macros? = nil

    // MARK: - Scale Computed

    var isScaleConnected: Bool {
        ScaleManager.shared.connectionState == .connected
    }

    var foodHasWeightUnit: Bool {
        weightRatiosG[food.baseServingUnit] != nil
    }

    var adjustedScaleReading: ScaleReading? {
        guard let reading = ScaleManager.shared.latestReading else { return nil }
        guard let offset = zeroOffset, offset != 0 else { return reading }
        let adjusted = reading.value - offset
        return ScaleReading(
            value: adjusted,
            unit: reading.unit,
            display: Self.formatReading(adjusted, unit: reading.unit),
            stable: reading.stable,
            rawHex: reading.rawHex)
    }

    var isSubtractiveMode: Bool { subtractiveStartWeight != nil }

    var subtractiveDelta: Double? {
        guard let start = subtractiveStartWeight,
              let reading = adjustedScaleReading else { return nil }
        return max(start - reading.value, 0)
    }

    // MARK: - Init

    // User's saved default for this food (loaded async)
    var userPreference: UserFoodPreference? = nil
    var hasPreference: Bool { userPreference?.defaultQuantity != nil || userPreference?.defaultUnit != nil }

    init(food: AnyFood, mode: DetailMode) {
        self.food = food
        self.mode = mode
        switch mode {
        case .add:
            selectedUnit = food.baseServingUnit
            quantityText = formatQuantity(food.baseServingSize, unit: food.baseServingUnit)
        case .edit(let entry):
            selectedUnit = entry.unit
            quantityText = formatQuantity(entry.quantity, unit: entry.unit)
        }
    }

    // MARK: - Computed

    var quantity: Double { Double(quantityText) ?? 0 }

    var scaleFactor: Double {
        scaleFactorForQuantity(
            quantity:    quantity,
            unit:        selectedUnit,
            baseServing: (food.baseServingSize, food.baseServingUnit),
            conversion:  conversions.first { $0.unitName == selectedUnit })
    }

    var scaledMacros: Macros {
        let m = food.baseMacros
        let s = scaleFactor
        return Macros(
            calories: round1(m.calories * s),
            proteinG: round1(m.proteinG * s),
            carbsG:   round1(m.carbsG   * s),
            fatG:     round1(m.fatG     * s))
    }

    var scaledExtendedNutrition: ExtendedNutrition {
        let n = food.extendedNutrition
        let s = scaleFactor
        return ExtendedNutrition(
            sodiumMg:      n.sodiumMg.map      { round1($0 * s) },
            cholesterolMg: n.cholesterolMg.map { round1($0 * s) },
            fiberG:        n.fiberG.map        { round1($0 * s) },
            sugarG:        n.sugarG.map        { round1($0 * s) },
            saturatedFatG: n.saturatedFatG.map { round1($0 * s) },
            transFatG:     n.transFatG.map     { round1($0 * s) },
            potassiumMg:   n.potassiumMg.map   { round1($0 * s) },
            calciumMg:     n.calciumMg.map     { round1($0 * s) },
            ironMg:        n.ironMg.map        { round1($0 * s) },
            vitaminDMcg:   n.vitaminDMcg.map   { round1($0 * s) },
            addedSugarG:   n.addedSugarG.map   { round1($0 * s) })
    }

    var hasExtendedNutrition: Bool {
        // Always show if there are macros — the section displays main macros in FDA layout
        // plus any available micronutrients
        true
    }

    /// Pills: base unit + "servings" + conversion units, deduplicated
    var unitPills: [String] {
        var seen = Set<String>()
        var pills: [String] = []
        for unit in [food.baseServingUnit, "servings"] + conversions.map(\.unitName) {
            if seen.insert(unit).inserted { pills.append(unit) }
        }
        return pills
    }

    // MARK: - Async Actions

    func loadConversions() async {
        isLoadingConversions = true
        do {
            switch food {
            case .custom(let f):
                conversions = try await APIClient.shared.getFoodUnitConversionsForCustomFood(f.id)
            case .usda(let f):
                conversions = try await APIClient.shared.getFoodUnitConversionsForUsdaFood(f.fdcId)
            case .community(let f):
                conversions = try await APIClient.shared.getFoodUnitConversionsForCommunityFood(f.id)
            }
        } catch {}
        isLoadingConversions = false
    }

    func loadPreferences() async {
        guard case .usda = food else { return }
        do {
            let prefs = try await APIClient.shared.getUserPreferences()
            suppressUsdaWarning = prefs.suppressUsdaWarning
            if !suppressUsdaWarning { showUsdaWarning = true }
        } catch {}
    }

    /// Load user's saved default for this food and apply as pre-fill (add mode only).
    func loadFoodPreference() async {
        guard case .add = mode else { return }
        do {
            let pref = try await APIClient.shared.getFoodPreference(foodRef: food.foodRef)
            userPreference = pref
            if let unit = pref.defaultUnit, !unit.isEmpty {
                selectedUnit = unit
            }
            if let qty = pref.defaultQuantity {
                quantityText = formatQuantity(qty, unit: selectedUnit)
            }
        } catch {
            // 404 = no preference, that's fine
        }
    }

    /// Save the current quantity + unit as the user's default for this food.
    func saveAsDefault() async {
        let req = UpsertFoodPreferenceRequest(
            defaultQuantity: quantity,
            defaultUnit: selectedUnit)
        do {
            userPreference = try await APIClient.shared.upsertFoodPreference(foodRef: food.foodRef, data: req)
        } catch {}
    }

    /// Clear the user's saved default for this food.
    func clearDefault() async {
        do {
            try await APIClient.shared.deleteFoodPreference(foodRef: food.foodRef)
            userPreference = nil
        } catch {}
    }

    func dismissUsdaWarning(dontWarnAgain: Bool) async {
        showUsdaWarning = false
        if dontWarnAgain {
            do {
                _ = try await APIClient.shared.updateUserPreferences(
                    UserPreferences(suppressUsdaWarning: true))
            } catch {}
        }
    }

    @discardableResult
    func saveEntry(date: String, logStore: DailyLogStore) async throws -> FoodEntry {
        isSaving = true
        defer { isSaving = false }
        let m   = scaledMacros
        let req = CreateFoodEntryRequest(
            date:            date,
            name:            food.displayName,
            calories:        m.calories,
            proteinG:        m.proteinG,
            carbsG:          m.carbsG,
            fatG:            m.fatG,
            quantity:        quantity,
            unit:            selectedUnit,
            source:          food.foodSource,
            mealLabel:       currentMealLabel(),
            usdaFdcId:       food.asUSDA?.fdcId,
            customFoodId:    food.asCustomFood?.id,
            communityFoodId: food.asCommunityFood?.id)
        return try await logStore.createEntry(req)
    }

    @discardableResult
    func updateEntry(id: String, logStore: DailyLogStore) async throws -> FoodEntry {
        isSaving = true
        defer { isSaving = false }
        let m   = scaledMacros
        let req = UpdateFoodEntryRequest(
            quantity: quantity,
            unit:     selectedUnit,
            calories: m.calories,
            proteinG: m.proteinG,
            carbsG:   m.carbsG,
            fatG:     m.fatG)
        let updated = try await APIClient.shared.updateEntry(id: id, data: req)
        // Reflect change in local store
        if let idx = logStore.entries.firstIndex(where: { $0.id == id }) {
            logStore.entries[idx] = updated
        }
        return updated
    }

    // MARK: - Unit Conversion Actions

    func addConversion(_ data: CreateFoodUnitConversionRequest) async throws {
        let conv = try await APIClient.shared.createFoodUnitConversion(data)
        conversions.append(conv)
    }

    func deleteConversion(id: String) async throws {
        try await APIClient.shared.deleteFoodUnitConversion(id: id)
        conversions.removeAll { $0.id == id }
    }

    // MARK: - Scale Actions

    func enterScaleWeighing() {
        scaleWeighingActive = true
        stableMacroPreview = nil
    }

    func exitScaleWeighing() {
        scaleWeighingActive = false
        cancelSubtractiveMode()
        // Pre-fill with last reading if available
        if let reading = adjustedScaleReading, reading.value > 0 {
            let foodUnit = scaleUnitToFoodUnit(reading.unit)
            quantityText = formatQuantity(reading.value, unit: foodUnit)
            selectedUnit = foodUnit
        }
    }

    func confirmScaleReading() {
        guard let reading = adjustedScaleReading, reading.stable, reading.value > 0 else { return }
        let foodUnit = scaleUnitToFoodUnit(reading.unit)
        quantityText = formatQuantity(reading.value, unit: foodUnit)
        selectedUnit = foodUnit
        confirmedViaScale = true
        scaleWeighingActive = false
        cancelSubtractiveMode()
    }

    func zeroScale() {
        guard let reading = ScaleManager.shared.latestReading else { return }
        zeroOffset = reading.value
    }

    func clearZero() {
        zeroOffset = nil
    }

    func toggleKeepZero() {
        keepZeroOffset.toggle()
    }

    func startSubtractiveMode() {
        guard let reading = adjustedScaleReading else { return }

        // Use confirmed quantity as start weight so user can eat and reweigh
        if quantity > 0 {
            let scaleFoodUnit = scaleUnitToFoodUnit(reading.unit)
            if let converted = convertUnit(fromUnit: selectedUnit, fromQty: quantity, toUnit: scaleFoodUnit) {
                subtractiveStartWeight = converted
                subtractiveStartUnit = reading.unit
                return
            }
        }

        // Fallback: use current scale reading (first-time weighing or non-convertible unit)
        guard reading.value > 0 else { return }
        subtractiveStartWeight = reading.value
        subtractiveStartUnit = reading.unit
    }

    func cancelSubtractiveMode() {
        subtractiveStartWeight = nil
        subtractiveStartUnit = nil
    }

    func confirmSubtractiveDelta() {
        guard let delta = subtractiveDelta, delta > 0 else { return }
        let scaleUnit = subtractiveStartUnit ?? .g
        let foodUnit = scaleUnitToFoodUnit(scaleUnit)
        quantityText = formatQuantity(delta, unit: foodUnit)
        selectedUnit = foodUnit
        confirmedViaScale = true
        scaleWeighingActive = false
        subtractiveStartWeight = nil
        subtractiveStartUnit = nil
    }

    func updateStableMacroPreview(reading: ScaleReading?) {
        guard let reading, reading.stable else { return }
        // Apply zero offset
        let value: Double
        if let offset = zeroOffset {
            value = reading.value - offset
        } else {
            value = reading.value
        }
        guard value > 0 else {
            stableMacroPreview = nil
            return
        }
        stableMacroPreview = scaledMacrosForWeight(
            value: value,
            unitRaw: reading.unit.rawValue,
            baseMacros: food.baseMacros,
            baseServingSize: food.baseServingSize,
            baseServingUnit: food.baseServingUnit)
    }

    func handleScaleDisconnect() {
        if scaleWeighingActive {
            exitScaleWeighing()
        }
    }

    // MARK: - Helpers

    private static func formatReading(_ value: Double, unit: ScaleUnit) -> String {
        let foodUnit: String
        switch unit {
        case .g:    foodUnit = "g"
        case .ml:   foodUnit = "ml"
        case .oz:   foodUnit = "oz"
        case .lbOz: foodUnit = "oz"
        }
        return "\(formatQuantity(value, unit: foodUnit)) \(unit.rawValue)"
    }

    private func scaleUnitToFoodUnit(_ unit: ScaleUnit) -> String {
        switch unit {
        case .g:    return "g"
        case .ml:   return "ml"
        case .oz:   return "oz"
        case .lbOz: return "oz"
        }
    }

    private func round1(_ v: Double) -> Double {
        (v * 10).rounded() / 10
    }
}
