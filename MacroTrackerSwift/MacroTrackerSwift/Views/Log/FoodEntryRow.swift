import SwiftUI
import UIKit

// MARK: - FoodEntryRow

/// A single food entry row with an inline macro summary.
/// Supports a multi-select mode where tap/long-press toggles selection instead of opening the editor.
@MainActor
struct FoodEntryRow: View {
    let entry:              FoodEntry
    let onDelete:           () -> Void
    let onTap:              () -> Void
    let isSelectionMode:    Bool
    let isSelected:         Bool
    let onSelect:           () -> Void
    var horizontalPadding:  CGFloat = Spacing.lg

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
        HStack(spacing: Spacing.md) {
            if isSelectionMode {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(isSelected ? Color.appTint : Color.appTextTertiary)
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                    Text(entry.name)
                        .font(.appBody)
                        .fontWeight(.regular)
                        .foregroundStyle(Color.appText)
                        .lineLimit(1)
                        .layoutPriority(1)
                    Text("·")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextTertiary)
                    Text("\(formatQuantity(entry.quantity, unit: entry.unit)) \(entry.unit)")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextTertiary)
                        .lineLimit(1)
                }
                HStack(spacing: 4) {
                    Image(systemName: FoodSourceIndicator.systemImage(for: entry.source))
                        .font(.system(size: 12))
                        .foregroundStyle(FoodSourceIndicator.accentColor(for: entry.source))
                        .accessibilityLabel(accessibilitySourceLabel)

                    if entry.confirmedViaScale == true {
                        Image(systemName: "scalemass.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(Color.appTint)
                            .accessibilityLabel("Weighed on scale")
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            MacroNutrientsColumn(macros: Macros(
                calories: entry.calories,
                proteinG: entry.proteinG,
                carbsG:   entry.carbsG,
                fatG:     entry.fatG))
        }
        .padding(.horizontal, horizontalPadding)
        .padding(.vertical, Spacing.md)
        .contentShape(Rectangle())
    }

    // MARK: - Helpers


    private var accessibilitySourceLabel: String {
        switch entry.source {
        case .custom:    return "My food"
        case .community: return "Community food"
        case .database:  return "USDA database food"
        }
    }
}
