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
            // Content area — tappable
            Button(action: {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                onTap()
            }) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(food.displayName)
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.appText)
                        .lineLimit(1)

                    MacroInlineLine(
                        prefix: "\(Self.fmt(food.baseServingSize)) \(food.baseServingUnit)",
                        macros: food.baseMacros)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)

            HStack(spacing: Spacing.sm) {
                Image(systemName: FoodSourceIndicator.systemImage(for: food.foodSource))
                    .font(.system(size: 16))
                    .foregroundStyle(FoodSourceIndicator.accentColor(for: food.foodSource))
                    .accessibilityLabel(accessibilitySourceLabel)

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
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
        .background(Color.appSurface)
        .contentShape(Rectangle())
    }

    private var accessibilitySourceLabel: String {
        switch food.foodSource {
        case .custom:    return "My food"
        case .community: return "Community food"
        case .database:  return "USDA database food"
        }
    }

    private static func fmt(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(v))
            : String(format: "%.1f", v)
    }
}
