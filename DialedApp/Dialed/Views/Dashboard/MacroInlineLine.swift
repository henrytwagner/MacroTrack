import SwiftUI

// MARK: - MacroInlineLine

/// Inline colored text showing cal · protein · carbs · fat.
/// Optional prefix (e.g. "150g chicken") displayed in secondary color before a dot separator.
/// Uses SwiftUI Text concatenation to preserve per-segment color without HStack overhead.
struct MacroInlineLine: View {
    /// Optional prefix shown before the dot and macro values.
    let prefix: String?
    let macros: Macros

    var body: some View {
        buildText()
            .font(.appCaption1)
            .tracking(Typography.Tracking.caption1)
            .lineLimit(1)
    }

    // MARK: Private

    private var dot: Text { Text(" · ").foregroundStyle(Color.appTextSecondary.opacity(0.7)) }

    private var macroText: Text {
        let cal  = Text("\(Int(macros.calories)) cal").foregroundStyle(Color.caloriesAccent).bold()
        let pro  = Text("\(Int(macros.proteinG))p").foregroundStyle(Color.proteinAccent)
        let carb = Text("\(Int(macros.carbsG))c").foregroundStyle(Color.carbsAccent)
        let fat  = Text("\(Int(macros.fatG))f").foregroundStyle(Color.fatAccent)
        return Text("\(cal)\(dot)\(pro)\(dot)\(carb)\(dot)\(fat)")
    }

    private func buildText() -> Text {
        if let prefix {
            let pre = Text(prefix).foregroundStyle(Color.appTextSecondary)
            return Text("\(pre)\(dot)\(macroText)")
        }
        return macroText
    }
}

// MARK: - MacroNutrientsColumn

/// Trailing-aligned two-line nutrient display used in food list rows.
/// Line 1: "165 cal" (medium weight). Line 2: colored "P  C  F".
struct MacroNutrientsColumn: View {
    let macros: Macros
    var font: Font = .appBody

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text("\(Int(macros.calories.rounded())) cal")
                .font(font)
                .fontWeight(.regular)
                .foregroundStyle(Color.caloriesAccent)
            HStack(spacing: 6) {
                Text("P \(Int(macros.proteinG.rounded()))")
                    .frame(minWidth: 20, alignment: .trailing)
                    .foregroundStyle(Color.proteinAccent)
                Text("C \(Int(macros.carbsG.rounded()))")
                    .frame(minWidth: 20, alignment: .trailing)
                    .foregroundStyle(Color.carbsAccent)
                Text("F \(Int(macros.fatG.rounded()))")
                    .frame(minWidth: 20, alignment: .trailing)
                    .foregroundStyle(Color.fatAccent)
            }
            .font(.appCaption2)
            .fontWeight(.semibold)
            .monospacedDigit()
        }
    }
}

// MARK: - Preview

#Preview {
    VStack(alignment: .leading, spacing: Spacing.md) {
        MacroInlineLine(prefix: "100g",
                        macros: Macros(calories: 350, proteinG: 30, carbsG: 42, fatG: 9))
        MacroInlineLine(prefix: nil,
                        macros: Macros(calories: 520, proteinG: 38, carbsG: 60, fatG: 14))
        MacroNutrientsColumn(macros: Macros(calories: 350, proteinG: 30, carbsG: 42, fatG: 9))
        MacroNutrientsColumn(macros: Macros(calories: 165, proteinG: 31, carbsG: 0, fatG: 4),
                             font: .appBody)
    }
    .padding()
}
