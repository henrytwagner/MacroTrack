import SwiftUI
import UIKit

// MARK: - FoodEntryRow

/// A single food entry row with swipe-to-delete and an inline macro summary.
@MainActor
struct FoodEntryRow: View {
    let entry:    FoodEntry
    let onDelete: () -> Void
    let onTap:    () -> Void

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.name)
                    .font(.appSubhead)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                MacroInlineLine(
                    prefix: "\(formattedQuantity) \(entry.unit)",
                    macros: Macros(
                        calories: entry.calories,
                        proteinG: entry.proteinG,
                        carbsG:   entry.carbsG,
                        fatG:     entry.fatG
                    )
                )
            }

            Spacer()

            Image(systemName: FoodSourceIndicator.systemImage(for: entry.source))
                .font(.system(size: 16))
                .foregroundStyle(FoodSourceIndicator.accentColor(for: entry.source))
                .accessibilityLabel(accessibilitySourceLabel)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
        .background(Color.appSurface)
        .contentShape(Rectangle())
        .onTapGesture {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onTap()
        }
        .contextMenu {
            Button(role: .destructive) {
                onDelete()
            } label: {
                Label("Delete Entry", systemImage: "trash")
            }
        }
    }

    // MARK: Helpers

    private var formattedQuantity: String {
        let q = entry.quantity
        if q.truncatingRemainder(dividingBy: 1) == 0, !q.isNaN, !q.isInfinite {
            return String(Int(q))
        }
        return String(format: "%.1f", q)
    }

    private var accessibilitySourceLabel: String {
        switch entry.source {
        case .custom:    return "My food"
        case .community: return "Community food"
        case .database:  return "USDA database food"
        }
    }
}
