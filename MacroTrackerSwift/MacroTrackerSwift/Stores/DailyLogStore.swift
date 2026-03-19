import Foundation
import Observation

/// Manages the food entries for the selected date.
/// Direct port of mobile/stores/dailyLogStore.ts.
@Observable @MainActor
final class DailyLogStore {
    static let shared = DailyLogStore()

    var entries:     [FoodEntry] = []
    var isLoading:   Bool = false
    var error:       String? = nil

    private init() {}

    // MARK: - Computed

    var entriesByMeal: [MealLabel: [FoodEntry]] {
        var groups: [MealLabel: [FoodEntry]] = [
            .breakfast: [], .lunch: [], .dinner: [], .snack: []
        ]
        for entry in entries {
            groups[entry.mealLabel, default: []].append(entry)
        }
        return groups
    }

    var totals: Macros {
        entries.reduce(.zero) { acc, e in
            Macros(
                calories: acc.calories + e.calories,
                proteinG: acc.proteinG + e.proteinG,
                carbsG:   acc.carbsG   + e.carbsG,
                fatG:     acc.fatG     + e.fatG)
        }
    }

    // MARK: - Actions

    func fetch(date: String) async {
        isLoading = true
        error = nil
        do {
            let fetched = try await APIClient.shared.getEntries(date: date)
            entries   = fetched.sorted { $0.createdAt < $1.createdAt }
            isLoading = false
        } catch {
            isLoading = false
            self.error = error.localizedDescription
        }
    }

    func addEntry(_ entry: FoodEntry) {
        entries = (entries + [entry]).sorted { $0.createdAt < $1.createdAt }
    }

    @discardableResult
    func removeEntry(id: String) -> FoodEntry? {
        guard let idx = entries.firstIndex(where: { $0.id == id }) else { return nil }
        let removed = entries[idx]
        entries.remove(at: idx)
        return removed
    }

    func restoreEntry(_ entry: FoodEntry) {
        entries = (entries + [entry]).sorted { $0.createdAt < $1.createdAt }
    }

    func commitDelete(id: String) async throws {
        try await APIClient.shared.deleteEntry(id: id)
    }

    /// Creates an entry via the API, inserts it locally, and returns it.
    /// Throws on network failure so callers can handle undo / error feedback.
    @discardableResult
    func createEntry(_ request: CreateFoodEntryRequest) async throws -> FoodEntry {
        let entry = try await APIClient.shared.createEntry(request)
        addEntry(entry)
        return entry
    }

    // MARK: - Frequent / Recent Foods

    var frequentFoods: [FrequentFood] = []

    func fetchFrequentFoods(limit: Int = 3) async {
        do {
            let foods = try await APIClient.shared.getFrequentFoods()
            frequentFoods = Array(foods.prefix(limit))
        } catch {
            // non-critical — swallow silently
        }
    }
}
