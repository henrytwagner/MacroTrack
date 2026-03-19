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

// MARK: - Preview

#Preview {
    VStack(alignment: .leading, spacing: Spacing.md) {
        MacroInlineLine(prefix: "100g",
                        macros: Macros(calories: 350, proteinG: 30, carbsG: 42, fatG: 9))
        MacroInlineLine(prefix: nil,
                        macros: Macros(calories: 520, proteinG: 38, carbsG: 60, fatG: 14))
    }
    .padding()
}
