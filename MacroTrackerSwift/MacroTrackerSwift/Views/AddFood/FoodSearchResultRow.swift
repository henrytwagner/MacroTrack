import SwiftUI
import UIKit

// MARK: - FoodSearchResultRow

/// A row in the unified search results. Shows name, inline macros, log-style source icon (right), and an optional quick-add "+".
@MainActor
struct FoodSearchResultRow: View {
    let food:        AnyFood
    let showQuickAdd: Bool
    let onTap:       () -> Void
    let onQuickAdd:  (() -> Void)?

    var body: some View {
        HStack(spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                    Text(food.displayName)
                        .font(.appBody)
                        .fontWeight(.medium)
                        .foregroundStyle(Color.appText)
                        .lineLimit(1)
                        .layoutPriority(1)
                    Text("·")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextTertiary)
                    Text("\(formatQuantity(food.baseServingSize, unit: food.baseServingUnit)) \(food.baseServingUnit)")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextTertiary)
                        .lineLimit(1)
                }
                Image(systemName: FoodSourceIndicator.systemImage(for: food.foodSource))
                    .font(.system(size: 12))
                    .foregroundStyle(FoodSourceIndicator.accentColor(for: food.foodSource))
                    .accessibilityLabel(accessibilitySourceLabel)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            MacroNutrientsColumn(macros: food.baseMacros)

            if showQuickAdd, let onQuickAdd {
                Button {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    onQuickAdd()
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Color.appTint)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
        .background(Color.appSurface)
        .contentShape(Rectangle())
        .onTapGesture {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onTap()
        }
    }

    private var accessibilitySourceLabel: String {
        switch food.foodSource {
        case .custom:    return "My food"
        case .community: return "Community food"
        case .database:  return "USDA database food"
        }
    }

}
