import SwiftUI

// MARK: - SessionGroupCard

/// A paused Kitchen Mode session displayed in the log, styled like MealGroup.
/// Title row + item rows in a card. Tapping the card reopens the session.
@MainActor
struct SessionGroupCard: View {
    let session: VoiceSessionSummary
    let onResume: () -> Void
    let onDelete: () -> Void

    private var allItems: [(id: String, name: String, quantity: Double, unit: String,
                            calories: Double, proteinG: Double, carbsG: Double, fatG: Double,
                            state: String)] {
        let confirmed = session.confirmedItems.map {
            (id: $0.id, name: $0.name, quantity: $0.quantity, unit: $0.unit,
             calories: $0.calories, proteinG: $0.proteinG, carbsG: $0.carbsG, fatG: $0.fatG,
             state: "normal")
        }
        let drafts = session.draftItems.map {
            (id: $0.id, name: $0.name, quantity: $0.quantity, unit: $0.unit,
             calories: $0.calories, proteinG: $0.proteinG, carbsG: $0.carbsG, fatG: $0.fatG,
             state: $0.state.rawValue)
        }
        return confirmed + drafts
    }

    private var totalCalories: Int {
        Int(session.totalCalories.rounded())
    }

    var body: some View {
        if allItems.isEmpty { EmptyView() } else {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                // Title row — matches MealGroup header
                HStack {
                    HStack(spacing: Spacing.xs) {
                        Image(systemName: "fork.knife.circle.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(Color.appTint)
                        Text("Kitchen Mode")
                            .font(.appTitle3)
                            .foregroundStyle(Color.appText)
                    }
                    Spacer()
                    Text("\(totalCalories) cal")
                        .font(.appSubhead)
                        .foregroundStyle(Color.appTextSecondary)
                }

                // Item rows in a card — matches MealGroup card
                VStack(spacing: 0) {
                    ForEach(Array(allItems.enumerated()), id: \.element.id) { idx, item in
                        if idx > 0 { Divider().padding(.leading, Spacing.lg) }
                        sessionItemRow(item)
                    }
                }
                .background(Color.appSurface)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                .contentShape(Rectangle())
                .onTapGesture {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    onResume()
                }
                .contextMenu {
                    Button(action: onResume) {
                        Label("Resume Session", systemImage: "arrow.counterclockwise")
                    }
                    Button(role: .destructive, action: onDelete) {
                        Label("Delete Session", systemImage: "trash")
                    }
                }
            }
        }
    }

    // MARK: - Item Row

    private func sessionItemRow(_ item: (id: String, name: String, quantity: Double, unit: String,
                                         calories: Double, proteinG: Double, carbsG: Double, fatG: Double,
                                         state: String)) -> some View {
        HStack(spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                    // State indicator for non-normal items
                    if item.state != "normal" {
                        Image(systemName: stateIcon(for: item.state))
                            .font(.system(size: 12))
                            .foregroundStyle(stateColor(for: item.state))
                    }

                    Text(item.name)
                        .font(.appBody)
                        .foregroundStyle(Color.appText)
                        .lineLimit(1)
                        .layoutPriority(1)

                    if item.state == "normal" {
                        Text("·")
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextTertiary)
                        Text("\(formatQuantity(item.quantity, unit: item.unit)) \(item.unit)")
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextTertiary)
                            .lineLimit(1)
                    } else {
                        Text("·")
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextTertiary)
                        Text(stateLabel(for: item.state))
                            .font(.appCaption1)
                            .foregroundStyle(stateColor(for: item.state))
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // Macro column for confirmed items
            if item.state == "normal" {
                MacroNutrientsColumn(macros: Macros(
                    calories: item.calories,
                    proteinG: item.proteinG,
                    carbsG:   item.carbsG,
                    fatG:     item.fatG))
            }
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
    }

    // MARK: - Helpers


    private func stateIcon(for state: String) -> String {
        switch state {
        case "pending":     return "clock"
        case "clarifying":  return "questionmark.circle"
        case "creating":    return "pencil.circle"
        case "choice":      return "list.bullet"
        default:            return "exclamationmark.circle"
        }
    }

    private func stateColor(for state: String) -> Color {
        switch state {
        case "pending":     return Color.appWarning
        case "clarifying":  return Color.appTint
        case "creating":    return Color.appTint
        default:            return Color.appTextTertiary
        }
    }

    private func stateLabel(for state: String) -> String {
        switch state {
        case "pending":     return "Pending"
        case "clarifying":  return "Needs info"
        case "creating":    return "Creating"
        case "choice":      return "Choose food"
        default:            return "In progress"
        }
    }
}
