import SwiftUI
import Charts

struct MacroDistributionChart: View {
    @Environment(StatsStore.self) private var statsStore

    private var distribution: [(name: String, value: Double, color: Color)] {
        let d = statsStore.macroDistribution
        return [
            ("Protein", d.protein, .proteinAccent),
            ("Carbs", d.carbs, .carbsAccent),
            ("Fat", d.fat, .fatAccent),
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Macro Split")
                .font(.appHeadline)
                .foregroundStyle(Color.appText)

            HStack(spacing: Spacing.xl) {
                Chart(distribution, id: \.name) { item in
                    SectorMark(
                        angle: .value(item.name, item.value),
                        innerRadius: .ratio(0.6)
                    )
                    .foregroundStyle(item.color)
                }
                .frame(width: 120, height: 120)

                VStack(alignment: .leading, spacing: Spacing.sm) {
                    ForEach(distribution, id: \.name) { item in
                        HStack(spacing: Spacing.sm) {
                            Circle().fill(item.color).frame(width: 10, height: 10)
                            Text(item.name)
                                .font(.appSubhead)
                                .foregroundStyle(Color.appText)
                            Spacer()
                            Text("\(Int(item.value))%")
                                .font(.appSubhead)
                                .fontWeight(.medium)
                                .foregroundStyle(Color.appText)
                                .monospacedDigit()
                        }
                    }
                }
            }
        }
        .padding(Spacing.xl)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
    }
}
