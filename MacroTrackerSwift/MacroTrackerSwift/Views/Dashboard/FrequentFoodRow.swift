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
            // Food info (fills remaining space)
            Button {
                onPressName()
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(food.name)
                        .font(.appBody)
                        .foregroundStyle(Color.appText)
                        .lineLimit(1)

                    MacroInlineLine(
                        prefix: "\(formatted(food.lastQuantity)) \(food.lastUnit)",
                        macros: food.macros)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)

            // Quick-add "+" button
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
    }

    private func formatted(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(v))
            : String(format: "%.1f", v)
    }
}
