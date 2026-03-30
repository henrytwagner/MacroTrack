import SwiftUI

struct QuickLogMealRow: View {
    let meal: FrequentMeal
    let onPressName: () -> Void
    let onQuickLog: (FrequentMeal) async -> Void

    var body: some View {
        HStack(spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text(meal.name)
                    .font(.appBody)
                    .fontWeight(.medium)
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                Text("\(meal.itemCount) item\(meal.itemCount == 1 ? "" : "s")")
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextTertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            MacroNutrientsColumn(macros: meal.totalMacros, font: .appBody)

            Button {
                Task { await onQuickLog(meal) }
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color.appTint)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
        .contentShape(Rectangle())
        .onTapGesture { onPressName() }
    }
}
