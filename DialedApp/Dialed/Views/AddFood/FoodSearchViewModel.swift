import Foundation
import Observation

// MARK: - FoodSearchViewModel

@Observable @MainActor
final class FoodSearchViewModel {

    var query:        String                 = ""
    var results:      UnifiedSearchResponse? = nil
    var isSearching:  Bool                   = false
    var frequentFoods: [FrequentFood]        = []
    var recentFoods:  [RecentFood]           = []
    var myFoods:      [CustomFood]           = []

    private var searchTask: Task<Void, Never>? = nil

    // MARK: - Search

    func onQueryChanged() {
        searchTask?.cancel()
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else {
            results = nil
            return
        }
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)  // 300 ms debounce
            guard !Task.isCancelled, let self else { return }
            await self.performSearch(query: trimmed)
        }
    }

    private func performSearch(query: String) async {
        isSearching = true
        do {
            results = try await APIClient.shared.searchFoods(query: query)
        } catch {
            // swallow — UI keeps showing previous results
        }
        isSearching = false
    }

    // MARK: - Frequent / Recent

    func fetchFrequentAndRecent() async {
        async let f: Void = fetchFrequent()
        async let r: Void = fetchRecent()
        _ = await (f, r)
    }

    private func fetchFrequent() async {
        do { frequentFoods = try await APIClient.shared.getFrequentFoods() } catch {}
    }

    private func fetchRecent() async {
        do { recentFoods = try await APIClient.shared.getRecentFoods() } catch {}
    }

    // MARK: - My Foods

    func fetchMyFoods() async {
        do { myFoods = try await APIClient.shared.getCustomFoods() } catch {}
    }
}
