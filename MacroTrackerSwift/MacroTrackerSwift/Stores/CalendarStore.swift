import Foundation
import Observation

@Observable @MainActor
final class CalendarStore {
    static let shared = CalendarStore()

    var summaries:      [String: DailySummaryItem] = [:]  // keyed by "YYYY-MM-DD"
    var displayedMonth: Date = Date()
    var isLoading:      Bool = false

    private var fetchedMonths: Set<String> = []

    private init() {}

    // MARK: - Fetch

    func fetchMonth(_ month: Date) async {
        let key = monthKey(month)
        guard !fetchedMonths.contains(key) else { return }

        isLoading = true
        let cal = Calendar.current

        // Compute range for the full calendar grid (may span prev/next month)
        guard let monthInterval = cal.dateInterval(of: .month, for: month) else {
            isLoading = false
            return
        }

        // Pad to start of week and end of week
        let startOfMonth = monthInterval.start
        let endOfMonth = cal.date(byAdding: .day, value: -1, to: monthInterval.end)!

        // Go back to Sunday of the first week
        let firstWeekday = cal.component(.weekday, from: startOfMonth)
        let paddedStart = cal.date(byAdding: .day, value: -(firstWeekday - 1), to: startOfMonth)!

        // Go forward to Saturday of the last week
        let lastWeekday = cal.component(.weekday, from: endOfMonth)
        let paddedEnd = cal.date(byAdding: .day, value: 7 - lastWeekday, to: endOfMonth)!

        let from = isoString(from: paddedStart)
        let to = isoString(from: paddedEnd)

        do {
            let response = try await APIClient.shared.getSummary(from: from, to: to)
            for item in response.summaries {
                summaries[item.date] = item
            }
            fetchedMonths.insert(key)
        } catch {
            // Non-critical
        }
        isLoading = false
    }

    func invalidate() {
        fetchedMonths.removeAll()
    }

    // MARK: - Computed

    var currentStreak: Int {
        computeStreak { item in item.entryCount > 0 }
    }

    var goalHitStreak: Int {
        computeStreak { item in
            guard let gc = item.goalCalories, let gp = item.goalProteinG,
                  let gca = item.goalCarbsG, let gf = item.goalFatG else { return false }
            return item.totalCalories <= gc * 1.05 &&
                   item.totalProteinG >= gp * 0.95 &&
                   item.totalCarbsG <= gca * 1.05 &&
                   item.totalFatG <= gf * 1.05
        }
    }

    // MARK: - Helpers

    private func computeStreak(_ predicate: (DailySummaryItem) -> Bool) -> Int {
        var streak = 0
        var date = Date()
        let cal = Calendar.current

        while true {
            let key = isoString(from: date)
            guard let item = summaries[key], predicate(item) else { break }
            streak += 1
            guard let prev = cal.date(byAdding: .day, value: -1, to: date) else { break }
            date = prev
        }
        return streak
    }

    private func monthKey(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: date)
    }

    private func isoString(from date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: date)
    }
}
