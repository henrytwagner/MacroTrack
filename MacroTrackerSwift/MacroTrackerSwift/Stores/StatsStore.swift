import Foundation
import Observation

enum StatsRange: String, CaseIterable, Sendable {
    case week        = "7D"
    case month       = "30D"
    case threeMonths = "90D"

    var days: Int {
        switch self {
        case .week:        return 7
        case .month:       return 30
        case .threeMonths: return 90
        }
    }
}

@Observable @MainActor
final class StatsStore {
    static let shared = StatsStore()

    var summaries:     [DailySummaryItem] = []
    var topFoods:      [FoodFrequencyItem] = []
    var selectedRange: StatsRange = .week
    var isLoading:     Bool = false

    private init() {}

    // MARK: - Fetch

    func fetch(range: StatsRange) async {
        selectedRange = range
        isLoading = true

        let to = todayString()
        let cal = Calendar.current
        let fromDate = cal.date(byAdding: .day, value: -range.days, to: Date())!
        let from = isoString(from: fromDate)

        async let summaryReq: Void = fetchSummaries(from: from, to: to)
        async let topFoodsReq: Void = fetchTopFoods(from: from, to: to)
        _ = await (summaryReq, topFoodsReq)

        isLoading = false
    }

    private func fetchSummaries(from: String, to: String) async {
        do {
            let response = try await APIClient.shared.getSummary(from: from, to: to)
            summaries = response.summaries.sorted { $0.date < $1.date }
        } catch { /* non-critical */ }
    }

    private func fetchTopFoods(from: String, to: String) async {
        do {
            topFoods = try await APIClient.shared.getTopFoods(from: from, to: to)
        } catch { /* non-critical */ }
    }

    // MARK: - Computed

    var avgCalories: Double {
        guard !summaries.isEmpty else { return 0 }
        return summaries.reduce(0) { $0 + $1.totalCalories } / Double(summaries.count)
    }

    var avgProtein: Double {
        guard !summaries.isEmpty else { return 0 }
        return summaries.reduce(0) { $0 + $1.totalProteinG } / Double(summaries.count)
    }

    var avgCarbs: Double {
        guard !summaries.isEmpty else { return 0 }
        return summaries.reduce(0) { $0 + $1.totalCarbsG } / Double(summaries.count)
    }

    var avgFat: Double {
        guard !summaries.isEmpty else { return 0 }
        return summaries.reduce(0) { $0 + $1.totalFatG } / Double(summaries.count)
    }

    var consistencyScore: Double {
        guard selectedRange.days > 0 else { return 0 }
        let daysLogged = summaries.filter { $0.entryCount > 0 }.count
        return Double(daysLogged) / Double(selectedRange.days) * 100
    }

    var goalHitRate: Double {
        let withGoals = summaries.filter { $0.goalCalories != nil }
        guard !withGoals.isEmpty else { return 0 }
        let met = withGoals.filter { item in
            guard let gc = item.goalCalories, let gp = item.goalProteinG,
                  let gca = item.goalCarbsG, let gf = item.goalFatG else { return false }
            return item.totalCalories <= gc * 1.05 &&
                   item.totalProteinG >= gp * 0.95 &&
                   item.totalCarbsG <= gca * 1.05 &&
                   item.totalFatG <= gf * 1.05
        }
        return Double(met.count) / Double(withGoals.count) * 100
    }

    var avgGoalCalories: Double? {
        let goals = summaries.compactMap(\.goalCalories)
        guard !goals.isEmpty else { return nil }
        return goals.reduce(0, +) / Double(goals.count)
    }

    /// Returns (proteinPct, carbsPct, fatPct) of total calories from macros
    var macroDistribution: (protein: Double, carbs: Double, fat: Double) {
        let totalP = summaries.reduce(0) { $0 + $1.totalProteinG }
        let totalC = summaries.reduce(0) { $0 + $1.totalCarbsG }
        let totalF = summaries.reduce(0) { $0 + $1.totalFatG }
        let totalCal = totalP * 4 + totalC * 4 + totalF * 9
        guard totalCal > 0 else { return (0, 0, 0) }
        return (
            protein: (totalP * 4 / totalCal) * 100,
            carbs:   (totalC * 4 / totalCal) * 100,
            fat:     (totalF * 9 / totalCal) * 100
        )
    }

    // MARK: - Helpers

    private func isoString(from date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: date)
    }
}
