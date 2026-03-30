import SwiftUI

struct MacroAveragesCard: View {
    @Environment(StatsStore.self) private var statsStore

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Daily Averages")
                .font(.appHeadline)
                .foregroundStyle(Color.appText)

            VStack(spacing: Spacing.md) {
                avgRow(label: "Calories", value: statsStore.avgCalories, unit: "cal", color: .caloriesAccent)
                avgRow(label: "Protein", value: statsStore.avgProtein, unit: "g", color: .proteinAccent)
                avgRow(label: "Carbs", value: statsStore.avgCarbs, unit: "g", color: .carbsAccent)
                avgRow(label: "Fat", value: statsStore.avgFat, unit: "g", color: .fatAccent)
            }
        }
        .padding(Spacing.xl)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
    }

    private func avgRow(label: String, value: Double, unit: String, color: Color) -> some View {
        HStack {
            Circle().fill(color).frame(width: 10, height: 10)
            Text(label)
                .font(.appBody)
                .foregroundStyle(Color.appText)
            Spacer()
            Text("\(Int(value)) \(unit)")
                .font(.appBody)
                .fontWeight(.medium)
                .foregroundStyle(Color.appText)
                .monospacedDigit()
        }
    }
}
