import SwiftUI
import Charts

struct MacroTrendChart: View {
    @Environment(StatsStore.self) private var statsStore

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Macro Trends")
                .font(.appHeadline)
                .foregroundStyle(Color.appText)

            if !statsStore.summaries.isEmpty {
                Chart {
                    ForEach(statsStore.summaries) { item in
                        let date = parseDate(item.date)
                        LineMark(x: .value("Date", date), y: .value("g", item.totalProteinG), series: .value("Macro", "Protein"))
                            .foregroundStyle(Color.proteinAccent)
                            .interpolationMethod(.catmullRom)
                        LineMark(x: .value("Date", date), y: .value("g", item.totalCarbsG), series: .value("Macro", "Carbs"))
                            .foregroundStyle(Color.carbsAccent)
                            .interpolationMethod(.catmullRom)
                        LineMark(x: .value("Date", date), y: .value("g", item.totalFatG), series: .value("Macro", "Fat"))
                            .foregroundStyle(Color.fatAccent)
                            .interpolationMethod(.catmullRom)
                    }
                }
                .frame(height: 180)
                .chartForegroundStyleScale([
                    "Protein": Color.proteinAccent,
                    "Carbs": Color.carbsAccent,
                    "Fat": Color.fatAccent
                ])
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
