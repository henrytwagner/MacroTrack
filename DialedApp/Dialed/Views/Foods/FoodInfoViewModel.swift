import Foundation
import Observation

// MARK: - FoodInfoViewModel

@Observable @MainActor
final class FoodInfoViewModel {

    let food: AnyFood

    var conversions: [FoodUnitConversion] = []
    var overlayPanel: FoodUnitConversionPanel = .idle
    var isLoadingConversions = false

    var isDeleting = false
    var deleteError: String?

    init(food: AnyFood) {
        self.food = food
    }

    // MARK: - Merged conversions (user overrides system for same unitName)

    var mergedConversions: [FoodUnitConversion] {
        var byName: [String: FoodUnitConversion] = [:]
        for conv in conversions {
            if let existing = byName[conv.unitName] {
                // User-level overrides system-level
                if conv.userId != nil || existing.isSystemLevel {
                    byName[conv.unitName] = conv
                }
            } else {
                byName[conv.unitName] = conv
            }
        }
        return Array(byName.values).sorted { $0.unitName < $1.unitName }
    }

    /// IDs of system-level conversions (for lock icon treatment in UI).
    var systemConversionIds: Set<String> {
        Set(conversions.filter(\.isSystemLevel).map(\.id))
    }

    // MARK: - Actions

    func loadConversions() async {
        isLoadingConversions = true
        do {
            switch food {
            case .custom(let f):
                conversions = try await APIClient.shared.getFoodUnitConversionsForCustomFood(f.id)
            case .community(let f), .dialed(let f):
                conversions = try await APIClient.shared.getFoodUnitConversionsForCommunityFood(f.id)
            case .usda:
                break // Not supported for USDA foods
            }
        } catch {}
        isLoadingConversions = false
    }

    func addConversion(unitName: String, quantityInBaseServings: Double) async throws {
        let req: CreateFoodUnitConversionRequest
        switch food {
        case .custom(let f):
            req = CreateFoodUnitConversionRequest(
                unitName: unitName, quantityInBaseServings: quantityInBaseServings,
                customFoodId: f.id, usdaFdcId: nil, measurementSystem: nil)
        case .community(let f), .dialed(let f):
            req = CreateFoodUnitConversionRequest(
                unitName: unitName, quantityInBaseServings: quantityInBaseServings,
                communityFoodId: f.id, usdaFdcId: nil, measurementSystem: nil)
        case .usda:
            return
        }
        _ = try await APIClient.shared.createFoodUnitConversion(req)
        await loadConversions()
    }

    func deleteConversion(id: String) async throws {
        // Guard: never delete system-level conversions
        guard !systemConversionIds.contains(id) else { return }
        try await APIClient.shared.deleteFoodUnitConversion(id: id)
        await loadConversions()
    }

    func deleteFood() async throws {
        guard case .custom(let f) = food else { return }
        isDeleting = true
        defer { isDeleting = false }
        try await APIClient.shared.deleteCustomFood(id: f.id)
    }
}
