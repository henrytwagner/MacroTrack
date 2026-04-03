import Foundation
import Observation
import SwiftUI

@Observable @MainActor
final class InsightsStore {
    static let shared = InsightsStore()

    var insights: [NutrientInsight] = []

    private var dismissedIds: Set<String> {
        get {
            Set(UserDefaults.standard.stringArray(forKey: "dismissedInsightIds") ?? [])
        }
        set {
            UserDefaults.standard.set(Array(newValue), forKey: "dismissedInsightIds")
        }
    }

    private init() {}

    // MARK: - Active

    var activeInsights: [NutrientInsight] {
        insights
            .filter { !dismissedIds.contains($0.id) }
            .sorted { $0.priority > $1.priority }
    }

    // MARK: - Dismiss

    func dismiss(_ id: String) {
        dismissedIds.insert(id)
    }

    // MARK: - Compute

    func computeInsights(summaries: [DailySummaryItem]) {
        var result: [NutrientInsight] = []

        let sorted = summaries.sorted { $0.date < $1.date }
        guard !sorted.isEmpty else {
            insights = []
            return
        }

        // 1. Logging streak
        let logStreak = computeStreak(sorted) { $0.entryCount > 0 }
        if logStreak >= 3 {
            result.append(NutrientInsight(
                id: "log-streak-\(logStreak)",
                type: .streak,
                priority: logStreak >= 14 ? 2 : 1,
                title: "Logging streak",
                message: "Logged \(logStreak) consecutive days",
                iconName: "flame.fill"))
        }

        // 2. Protein goal streak
        let proteinStreak = computeStreak(sorted) { item in
            guard let gp = item.goalProteinG else { return false }
            return item.totalProteinG >= gp * 0.95
        }
        if proteinStreak >= 3 {
            result.append(NutrientInsight(
                id: "protein-streak-\(proteinStreak)",
                type: .streak,
                priority: 1,
                title: "Protein goal",
                message: "Met \(proteinStreak) days in a row",
                iconName: "bolt.fill"))
        }

        // 3. Calorie trend warning
        let withGoals = sorted.filter { $0.goalCalories != nil }
        if withGoals.count >= 3 {
            let avgCal = withGoals.reduce(0.0) { $0 + $1.totalCalories } / Double(withGoals.count)
            let avgGoal = withGoals.compactMap(\.goalCalories).reduce(0.0, +) / Double(withGoals.count)
            if avgGoal > 0 {
                let pct = ((avgCal - avgGoal) / avgGoal) * 100
                if pct > 15 {
                    result.append(NutrientInsight(
                        id: "cal-over",
                        type: .warning,
                        priority: 2,
                        title: "Calorie trend",
                        message: "Avg daily: \(Int(avgCal)) cal (\(Int(pct))% above \(Int(avgGoal)) target)",
                        iconName: "exclamationmark.triangle.fill"))
                } else if pct < -25 {
                    result.append(NutrientInsight(
                        id: "cal-under",
                        type: .warning,
                        priority: 2,
                        title: "Calorie trend",
                        message: "Avg daily: \(Int(avgCal)) cal (\(Int(abs(pct)))% below \(Int(avgGoal)) target)",
                        iconName: "exclamationmark.triangle.fill"))
                }
            }
        }

        // 4. Consistency
        let last7 = sorted.suffix(7)
        if last7.count >= 5 {
            let daysLogged = last7.filter { $0.entryCount > 0 }.count
            let pct = Int(Double(daysLogged) / Double(last7.count) * 100)
            result.append(NutrientInsight(
                id: "consistency-\(pct)",
                type: .pattern,
                priority: 0,
                title: "Consistency",
                message: "Logging: \(pct)% (\(daysLogged)/\(last7.count) days this week)",
                iconName: "chart.bar.fill"))
        }

        insights = result
    }

    // MARK: - Helpers

    private func computeStreak(_ sorted: [DailySummaryItem],
                               predicate: (DailySummaryItem) -> Bool) -> Int {
        var streak = 0
        for item in sorted.reversed() {
            if predicate(item) {
                streak += 1
            } else {
                break
            }
        }
        return streak
    }
}
