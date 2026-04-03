import SwiftUI

struct ShareDayView: View {
    let date: String
    let entries: [FoodEntry]
    let totals: Macros
    let goals: DailyGoal?

    var body: some View {
        VStack(spacing: Spacing.lg) {
            // Header
            HStack {
                Text("Dialed")
                    .font(.appHeadline)
                    .foregroundStyle(Color.appTint)
                Spacer()
                Text(formattedDate)
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTextSecondary)
            }

            Divider()

            // Macro summary
            HStack(spacing: Spacing.lg) {
                macroItem("Cal", value: totals.calories, color: .caloriesAccent)
                macroItem("Protein", value: totals.proteinG, color: .proteinAccent, unit: "g")
                macroItem("Carbs", value: totals.carbsG, color: .carbsAccent, unit: "g")
                macroItem("Fat", value: totals.fatG, color: .fatAccent, unit: "g")
            }

            Divider()

            // Food list
            VStack(spacing: Spacing.sm) {
                ForEach(entries) { entry in
                    HStack {
                        Text(entry.name)
                            .font(.appSubhead)
                            .foregroundStyle(Color.appText)
                            .lineLimit(1)
                        Spacer()
                        Text("\(Int(entry.calories)) cal")
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextSecondary)
                            .monospacedDigit()
                    }
                }
            }
        }
        .padding(Spacing.xl)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        .frame(width: 340)
    }

    private func macroItem(_ label: String, value: Double, color: Color, unit: String = "") -> some View {
        VStack(spacing: 4) {
            Text("\(Int(value))\(unit)")
                .font(.appHeadline)
                .fontWeight(.bold)
                .foregroundStyle(color)
                .monospacedDigit()
            Text(label)
                .font(.appCaption2)
                .foregroundStyle(Color.appTextSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    private var formattedDate: String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        guard let d = f.date(from: date) else { return date }
        let out = DateFormatter()
        out.dateFormat = "EEEE, MMM d"
        return out.string(from: d)
    }
}
