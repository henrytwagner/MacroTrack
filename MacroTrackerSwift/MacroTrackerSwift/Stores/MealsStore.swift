import Foundation
import Observation

/// Manages saved meal templates.
@Observable @MainActor
final class MealsStore {
    static let shared = MealsStore()

    var meals:     [SavedMeal] = []
    var isLoading: Bool = false

    private init() {}

    // MARK: - Fetch

    func fetch() async {
        isLoading = true
        do {
            meals = try await APIClient.shared.getMeals()
        } catch {
            // Non-critical — meals list just stays empty on failure
        }
        isLoading = false
    }

    // MARK: - Create

    @discardableResult
    func create(name: String, items: [SavedMealItem]) async throws -> SavedMeal {
        let reqItems = items.map { item in
            CreateSavedMealItemRequest(
                name:            item.name,
                quantity:        item.quantity,
                unit:            item.unit,
                calories:        item.calories,
                proteinG:        item.proteinG,
                carbsG:          item.carbsG,
                fatG:            item.fatG,
                source:          item.source,
                usdaFdcId:       item.usdaFdcId,
                customFoodId:    item.customFoodId,
                communityFoodId: item.communityFoodId)
        }
        let req  = CreateSavedMealRequest(name: name, items: reqItems)
        let meal = try await APIClient.shared.createMeal(req)
        meals.insert(meal, at: 0)
        return meal
    }

    // MARK: - Update

    func update(id: String, name: String, items: [SavedMealItem]) async throws {
        let reqItems = items.map { item in
            CreateSavedMealItemRequest(
                name:            item.name,
                quantity:        item.quantity,
                unit:            item.unit,
                calories:        item.calories,
                proteinG:        item.proteinG,
                carbsG:          item.carbsG,
                fatG:            item.fatG,
                source:          item.source,
                usdaFdcId:       item.usdaFdcId,
                customFoodId:    item.customFoodId,
                communityFoodId: item.communityFoodId)
        }
        let req  = CreateSavedMealRequest(name: name, items: reqItems)
        let meal = try await APIClient.shared.updateMeal(id: id, data: req)
        if let idx = meals.firstIndex(where: { $0.id == id }) {
            meals[idx] = meal
        }
    }

    // MARK: - Delete

    func delete(id: String) async throws {
        try await APIClient.shared.deleteMeal(id: id)
        meals.removeAll { $0.id == id }
    }

    // MARK: - Log

    /// Creates food entries from a saved meal template.
    /// Callers should refresh DailyLogStore after calling this.
    func logMeal(savedMealId: String, date: String, mealLabel: MealLabel,
                 scaleFactor: Double) async throws -> [FoodEntry] {
        let req = LogMealRequest(date: date, mealLabel: mealLabel, scaleFactor: scaleFactor)
        return try await APIClient.shared.logMeal(savedMealId: savedMealId, req: req)
    }

    // MARK: - Helpers

    func meal(for id: String) -> SavedMeal? {
        meals.first { $0.id == id }
    }
}
