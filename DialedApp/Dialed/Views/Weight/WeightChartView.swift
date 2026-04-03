import SwiftUI
import Charts

struct WeightChartView: View {
    let entries: [WeightEntry]
    let movingAverage: [WeightMovingAvgPoint]

    var body: some View {
        Chart {
            ForEach(entries) { entry in
                LineMark(
                    x: .value("Date", parseDate(entry.date)),
                    y: .value("Weight", entry.weightKg)
                )
                .foregroundStyle(Color.appTint)
                .interpolationMethod(.catmullRom)
                .symbol(.circle)
                .symbolSize(20)
            }

            ForEach(Array(movingAverage.enumerated()), id: \.offset) { _, point in
                LineMark(
                    x: .value("Date", parseDate(point.date)),
                    y: .value("Avg", point.value),
                    series: .value("Series", "avg")
                )
                .foregroundStyle(Color.appTint.opacity(0.3))
                .interpolationMethod(.catmullRom)
                .lineStyle(StrokeStyle(lineWidth: 2, dash: [5, 3]))
            }
        }
        .chartYScale(domain: yDomain)
        .chartXAxis {
            AxisMarks(values: .stride(by: .day, count: 7)) { _ in
                AxisGridLine()
                AxisValueLabel(format: .dateTime.month(.abbreviated).day())
            }
        }
        .chartYAxis {
            AxisMarks { _ in
                AxisGridLine()
                AxisValueLabel()
            }
        }
    }

    private var yDomain: ClosedRange<Double> {
        let weights = entries.map(\.weightKg)
        guard let lo = weights.min(), let hi = weights.max() else {
            return 0...100
        }
        let padding = Swift.max(1.0, (hi - lo) * 0.1)
        return (lo - padding)...(hi + padding)
    }

    private func parseDate(_ dateStr: String) -> Date {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.date(from: dateStr) ?? Date()
    }
}
