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

    // MARK: - Init

    init(food: AnyFood, mode: DetailMode) {
        self.food = food
        self.mode = mode
        switch mode {
        case .add:
            quantityText = Self.format(food.baseServingSize)
            selectedUnit = food.baseServingUnit
        case .edit(let entry):
            quantityText = Self.format(entry.quantity)
            selectedUnit = entry.unit
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
            case .community:
                conversions = []
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

    // MARK: - Helpers

    private static func format(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(v))
            : String(format: "%.1f", v)
    }

    private func round1(_ v: Double) -> Double {
        (v * 10).rounded() / 10
    }
}
