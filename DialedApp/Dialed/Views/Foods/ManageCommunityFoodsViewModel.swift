import Foundation
import Observation

// MARK: - ManageCommunityFoodsViewModel

@Observable @MainActor
final class ManageCommunityFoodsViewModel {

    var foods:     [CommunityFood] = []
    var isLoading: Bool            = false
    var error:     String?         = nil
    var query:     String          = ""

    // MARK: - Computed

    var filteredFoods: [CommunityFood] {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return foods }
        let q = query.lowercased()
        return foods.filter {
            $0.name.lowercased().contains(q)
            || ($0.brandName?.lowercased().contains(q) ?? false)
        }
    }

    // MARK: - Load

    func load() async {
        isLoading = true
        error     = nil
        defer { isLoading = false }
        do {
            foods = try await APIClient.shared.getCommunityFoods(status: "ALL", limit: 100)
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Delete

    func delete(_ food: CommunityFood) async throws {
        try await APIClient.shared.deleteCommunityFood(id: food.id)
        foods.removeAll { $0.id == food.id }
    }
}
