import SwiftUI
import Charts

struct CalorieTrendChart: View {
    @Environment(StatsStore.self) private var statsStore

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Calorie Trend")
                .font(.appHeadline)
                .foregroundStyle(Color.appText)

            if statsStore.summaries.isEmpty {
                Text("No data for this period")
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTextTertiary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, Spacing.xl)
            } else {
                Chart {
                    ForEach(statsStore.summaries) { item in
                        LineMark(
                            x: .value("Date", parseDate(item.date)),
                            y: .value("Calories", item.totalCalories)
                        )
                        .foregroundStyle(Color.caloriesAccent)
                        .interpolationMethod(.catmullRom)
                    }

                    if let goal = statsStore.avgGoalCalories {
                        RuleMark(y: .value("Goal", goal))
                            .foregroundStyle(Color.appTextTertiary.opacity(0.5))
                            .lineStyle(StrokeStyle(lineWidth: 1, dash: [5, 5]))
                            .annotation(position: .top, alignment: .trailing) {
                                Text("Goal")
                                    .font(.appCaption2)
                                    .foregroundStyle(Color.appTextTertiary)
                            }
                    }
                }
                .frame(height: 200)
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 5)) { _ in
                        AxisGridLine()
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                    }
                }
            }
        }
        .padding(Spacing.xl)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
    }

    private func parseDate(_ dateStr: String) -> Date {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.date(from: dateStr) ?? Date()
    }
}
