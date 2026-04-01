import SwiftUI
import UIKit

// MARK: - FrequentFoodRow

/// A row showing a frequent food with its macro inline line and a quick-add "+" button.
struct FrequentFoodRow: View {
    let food:        FrequentFood
    let onPressName: () -> Void
    let onQuickAdd:  (FrequentFood) async -> Void

    var body: some View {
        HStack(spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                    Text(food.name)
                        .font(.appBody)
                        .fontWeight(.medium)
                        .foregroundStyle(Color.appText)
                        .lineLimit(1)
                        .layoutPriority(1)
                    Text("·")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextTertiary)
                    Text("\(formatQuantity(food.lastQuantity, unit: food.lastUnit)) \(food.lastUnit)")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextTertiary)
                        .lineLimit(1)
                }
                Image(systemName: FoodSourceIndicator.systemImage(for: food.source))
                    .font(.system(size: 12))
                    .foregroundStyle(FoodSourceIndicator.accentColor(for: food.source))
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            MacroNutrientsColumn(macros: food.macros, font: .appBody)

            // Quick-add "+" button — independent touch target
            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                Task { await onQuickAdd(food) }
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color.appTint)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
        .contentShape(Rectangle())
        .onTapGesture {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onPressName()
        }
    }

}
