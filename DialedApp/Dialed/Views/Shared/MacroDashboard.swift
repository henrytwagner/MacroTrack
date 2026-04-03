import SwiftUI

// MARK: - MacroDashboard

/// 4-column macro dashboard matching Kitchen Mode's hero layout.
/// Used by both DraftMealCard (with flash animations) and FoodDetailSheet (static).
struct MacroDashboard: View {
    let cal: Double
    let protein: Double
    let carbs: Double
    let fat: Double

    // Optional flash scale bindings for Kitchen Mode animations (default 1.0 = no flash)
    var calFlash: CGFloat = 1
    var proteinFlash: CGFloat = 1
    var carbsFlash: CGFloat = 1
    var fatFlash: CGFloat = 1

    var body: some View {
        HStack(spacing: 0) {
            column(value: cal, label: "Cal", color: Color.caloriesAccent, flash: calFlash, isCal: true)
            column(value: protein, label: "Protein", color: Color.proteinAccent, flash: proteinFlash)
            column(value: carbs, label: "Carbs", color: Color.carbsAccent, flash: carbsFlash)
            column(value: fat, label: "Fat", color: Color.fatAccent, flash: fatFlash)
        }
    }

    private func column(value: Double, label: String, color: Color, flash: CGFloat, isCal: Bool = false) -> some View {
        VStack(spacing: 4) {
            Text(isCal ? "\(Int(value.rounded()))" : String(format: "%.1fg", value))
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundStyle(Color.appText)
                .scaleEffect(flash)

            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Color.appTextSecondary)

            RoundedRectangle(cornerRadius: 2)
                .fill(color)
                .frame(height: 3)
                .padding(.horizontal, Spacing.sm)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - MacroDashboardOptional

/// Variant that supports optional values — uncollected fields show "—".
/// Used by Kitchen Mode's creating/pending states.
struct MacroDashboardOptional: View {
    let cal: Double?
    let protein: Double?
    let carbs: Double?
    let fat: Double?

    var body: some View {
        HStack(spacing: 0) {
            column(value: cal, label: "Cal", color: Color.caloriesAccent, isCal: true)
            column(value: protein, label: "Protein", color: Color.proteinAccent)
            column(value: carbs, label: "Carbs", color: Color.carbsAccent)
            column(value: fat, label: "Fat", color: Color.fatAccent)
        }
    }

    private func column(value: Double?, label: String, color: Color, isCal: Bool = false) -> some View {
        VStack(spacing: 4) {
            if let v = value {
                Text(isCal ? "\(Int(v.rounded()))" : String(format: "%.1fg", v))
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.appText)
            } else {
                Text("—")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.appTextTertiary)
            }

            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Color.appTextSecondary)

            RoundedRectangle(cornerRadius: 2)
                .fill(value != nil ? color : color.opacity(0.25))
                .frame(height: 3)
                .padding(.horizontal, Spacing.sm)
        }
        .frame(maxWidth: .infinity)
    }
}
