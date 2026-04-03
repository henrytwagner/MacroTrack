import Foundation
import Observation

@Observable @MainActor
final class WeightStore {
    static let shared = WeightStore()

    var entries:        [WeightEntry] = []
    var movingAverage:  [WeightMovingAvgPoint] = []
    var weeklyRateKg:   Double? = nil
    var isLoading:      Bool = false

    private init() {}

    // MARK: - Computed

    var latestWeight: Double? { entries.last?.weightKg }

    // MARK: - Fetch

    func fetch(from: String, to: String) async {
        isLoading = true
        do {
            let response = try await APIClient.shared.getWeightEntries(from: from, to: to)
            entries = response.entries
            movingAverage = response.movingAverage7Day
            weeklyRateKg = response.weeklyRateKg
        } catch {
            // Non-critical
        }
        isLoading = false
    }

    // MARK: - Log

    @discardableResult
    func log(date: String, weightKg: Double, note: String? = nil) async throws -> WeightEntry {
        let req = CreateWeightEntryRequest(date: date, weightKg: weightKg, note: note)
        let entry = try await APIClient.shared.logWeight(req)
        // Insert or replace in local array
        if let idx = entries.firstIndex(where: { $0.date == entry.date }) {
            entries[idx] = entry
        } else {
            entries.append(entry)
            entries.sort { $0.date < $1.date }
        }
        return entry
    }

    // MARK: - Delete

    func delete(id: String) async throws {
        try await APIClient.shared.deleteWeight(id: id)
        entries.removeAll { $0.id == id }
    }
}
