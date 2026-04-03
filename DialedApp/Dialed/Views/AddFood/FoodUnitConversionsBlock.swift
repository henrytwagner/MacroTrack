import SwiftUI
import UIKit

// MARK: - FoodUnitConversionsBlock

/// Renders the unit pill row.
///
/// - `noUnitSelection == false` (FoodDetailSheet): shows base pills + conversion pills;
///    tapping a pill selects it via `selectedUnit`.
/// - `noUnitSelection == true` (CreateFoodSheet): hides base pills; tapping a
///    conversion pill opens a per-unit preview card (`.unitPreview`). "+" goes
///    directly to `.picking`.
@MainActor
struct FoodUnitConversionsBlock: View {
    @Binding var overlayPanel: FoodUnitConversionPanel

    /// Existing saved conversions (for detail sheet).
    var conversions: [FoodUnitConversion]

    /// Draft conversions (for create sheet — no server ID yet).
    var pendingConversions: [PendingUnitConversion]

    /// When non-nil, tapping a pill selects the unit instead of opening the overlay.
    @Binding var selectedUnit: String

    /// Base unit pills shown before the conversion pills (ignored in noUnitSelection mode).
    var basePills: [String]

    /// When true, disables unit selection on tap and routes pill taps to .unitPreview.
    var noUnitSelection: Bool = false

    /// Primary accent for pills and the add button (e.g. community publish uses `appSuccess`).
    var accentColor: Color = Color.appTint

    /// IDs of system-level (immutable) conversions — shown with a lock icon.
    var systemConversionIds: Set<String> = []

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.sm) {
                if !noUnitSelection {
                    // Base pills (base unit + "servings") — FoodDetailSheet only
                    ForEach(basePills, id: \.self) { unit in
                        pill(label: unit, isSelected: selectedUnit == unit, isPreviewActive: false) {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            selectedUnit = unit
                        }
                    }

                    // Saved conversion pills — selection mode
                    ForEach(conversions) { conv in
                        pill(label: conv.unitName, isSelected: selectedUnit == conv.unitName, isPreviewActive: false, isSystem: systemConversionIds.contains(conv.id)) {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            selectedUnit = conv.unitName
                        }
                    }

                    // Pending conversion pills — selection mode
                    ForEach(pendingConversions) { conv in
                        pill(label: conv.unitName, isSelected: selectedUnit == conv.unitName, isPreviewActive: false) {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            selectedUnit = conv.unitName
                        }
                    }
                } else {
                    // noUnitSelection mode (CreateFoodSheet / FoodInfoPage): only conversion pills, no base pills
                    ForEach(conversions) { conv in
                        let isActive = overlayPanel == .unitPreview(unitName: conv.unitName)
                        pill(label: conv.unitName, isSelected: false, isPreviewActive: isActive, isSystem: systemConversionIds.contains(conv.id)) {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            if isActive {
                                overlayPanel = .idle
                            } else {
                                overlayPanel = .unitPreview(unitName: conv.unitName)
                            }
                        }
                    }

                    ForEach(pendingConversions) { conv in
                        let isActive = overlayPanel == .unitPreview(unitName: conv.unitName)
                        pill(label: conv.unitName, isSelected: false, isPreviewActive: isActive) {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            if isActive {
                                overlayPanel = .idle
                            } else {
                                overlayPanel = .unitPreview(unitName: conv.unitName)
                            }
                        }
                    }
                }

                // "+" button
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    overlayPanel = noUnitSelection ? .picking : .preview
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(accentColor)
                        .frame(width: 32, height: 28)
                        .background(accentColor.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.xs)
        }
    }

    // MARK: - Pill

    private func pill(label: String, isSelected: Bool, isPreviewActive: Bool, isSystem: Bool = false, onTap: @escaping () -> Void) -> some View {
        Button(action: onTap) {
            HStack(spacing: 3) {
                if isSystem {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 8))
                        .foregroundStyle(isSelected ? Color.white.opacity(0.7) : Color.appTextTertiary)
                }
                Text(label)
                    .font(.appCaption1)
                    .fontWeight(isSelected ? .semibold : .regular)
                    .foregroundStyle(isSelected ? Color.white : Color.appText)
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.xs + 2)
            .background(isSelected ? accentColor : Color.appSurfaceSecondary)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(
                        isPreviewActive ? accentColor : (isSelected ? Color.clear : Color.appBorder),
                        lineWidth: isPreviewActive ? 1.5 : 0.5
                    )
            )
        }
        .buttonStyle(.plain)
    }
}
