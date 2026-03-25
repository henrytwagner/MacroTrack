import SwiftUI
import UIKit

// MARK: - FoodEntryRow

/// A single food entry row with an inline macro summary.
/// Supports a multi-select mode where tap/long-press toggles selection instead of opening the editor.
@MainActor
struct FoodEntryRow: View {
    let entry:           FoodEntry
    let onDelete:        () -> Void
    let onTap:           () -> Void
    let isSelectionMode: Bool
    let isSelected:      Bool
    let onSelect:        () -> Void

    var body: some View {
        Group {
            if isSelectionMode {
                rowContent
                    .onTapGesture {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        onSelect()
                    }
                    .onLongPressGesture {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        onSelect()
                    }
            } else {
                rowContent
                    .onTapGesture {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        onTap()
                    }
                    .contextMenu {
                        Button {
                            onSelect()
                        } label: {
                            Label("Select", systemImage: "checkmark.circle")
                        }
                        Button(role: .destructive) {
                            onDelete()
                        } label: {
                            Label("Delete Entry", systemImage: "trash")
                        }
                    }
            }
        }
        .background(isSelected ? Color.appTint.opacity(0.08) : Color.appSurface)
        .contentShape(Rectangle())
        .animation(.spring(response: 0.2, dampingFraction: 0.8), value: isSelected)
    }

    // MARK: - Row Content

    private var rowContent: some View {
        HStack(spacing: 0) {
            if isSelectionMode {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(isSelected ? Color.appTint : Color.appTextTertiary)
                    .padding(.trailing, Spacing.sm)
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }

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
    }

    // MARK: - Helpers

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
