import Foundation
import Observation

// MARK: - ManageCustomFoodsViewModel

@Observable @MainActor
final class ManageCustomFoodsViewModel {

    var foods:       [CustomFood] = []
    var isLoading:   Bool         = false
    var error:       String?      = nil
    var query:       String       = ""
    var deletedFood: CustomFood?  = nil

    // MARK: - Computed

    var filteredFoods: [CustomFood] {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return foods }
        let q = query.lowercased()
        return foods.filter { $0.name.lowercased().contains(q) }
    }

    // MARK: - Load

    func load() async {
        isLoading = true
        error     = nil
        defer { isLoading = false }
        do {
            foods = try await APIClient.shared.getCustomFoods()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Delete (optimistic)

    /// Removes the food from the list immediately and stores it for potential undo.
    func delete(_ food: CustomFood) {
        foods.removeAll { $0.id == food.id }
        deletedFood = food
    }

    /// Called when the undo window expires — permanently deletes from the server.
    /// Returns true if the delete succeeded.
    func commitDelete(_ food: CustomFood) async -> Bool {
        do {
            try await APIClient.shared.deleteCustomFood(id: food.id)
            if deletedFood?.id == food.id { deletedFood = nil }
            return true
        } catch {
            // Re-insert if the server delete fails
            foods.append(food)
            foods.sort { $0.name.localizedCompare($1.name) == .orderedAscending }
            self.error = error.localizedDescription
            if deletedFood?.id == food.id { deletedFood = nil }
            return false
        }
    }

    /// Restores the optimistically-deleted food back into the sorted list.
    func undoDelete() {
        guard let food = deletedFood else { return }
        foods.append(food)
        foods.sort { $0.name.localizedCompare($1.name) == .orderedAscending }
        deletedFood = nil
    }
}
