import SwiftUI

// MARK: - MacroProgressBar

/// Horizontal progress bar for a single macro or calorie total.
/// Handles normal fill and overflow (with proportional goal/overflow segments).
struct MacroProgressBar: View {
    let label:         String
    let current:       Double
    let goal:          Double?
    let accentColor:   Color
    let overflowColor: Color
    /// Unit suffix appended to value labels: " cal" for calories, "g" for macros.
    let unit:          String

    // MARK: Derived

    private var progress: Double {
        guard let goal, goal > 0 else { return 0 }
        return current / goal
    }

    private var isOverflow: Bool { progress > 1.0 }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {

            // Label + value row
            HStack {
                Text(label)
                    .font(.appSubhead)
                    .fontWeight(.semibold)
                    .tracking(Typography.Tracking.subhead)
                    .foregroundStyle(Color.appText)

                Spacer()

                Text(valueText)
                    .font(.appSubhead)
                    .tracking(Typography.Tracking.subhead)
                    .foregroundStyle(isOverflow ? overflowColor : Color.appText)
            }

            // Bar track + fill
            GeometryReader { geo in
                let trackWidth = geo.size.width
                ZStack(alignment: .leading) {
                    // Track background
                    RoundedRectangle(cornerRadius: BorderRadius.sm)
                        .fill(Color.progressTrack)
                        .frame(height: 8)

                    if isOverflow, let goal, goal > 0 {
                        // Proportional segments: goal | 2pt divider | overflow
                        // Outer edges are rounded; inner edges (touching the divider) are square.
                        let overflowFrac  = progress - 1.0
                        let totalParts    = 1.0 + overflowFrac
                        let goalWidth     = (1.0 / totalParts) * trackWidth
                        let overflowWidth = max(0, (overflowFrac / totalParts) * trackWidth - 2)
                        let r = BorderRadius.sm

                        HStack(spacing: 0) {
                            // Goal segment: rounded left, square right
                            UnevenRoundedRectangle(
                                topLeadingRadius: r, bottomLeadingRadius: r,
                                bottomTrailingRadius: 0, topTrailingRadius: 0)
                                .fill(accentColor)
                                .frame(width: goalWidth, height: 8)

                            // 2pt white divider
                            Rectangle()
                                .fill(Color.appSurface)
                                .frame(width: 2, height: 8)

                            // Overflow segment: square left, rounded right
                            UnevenRoundedRectangle(
                                topLeadingRadius: 0, bottomLeadingRadius: 0,
                                bottomTrailingRadius: r, topTrailingRadius: r)
                                .fill(overflowColor)
                                .frame(width: overflowWidth, height: 8)
                        }
                    } else {
                        // Normal fill
                        RoundedRectangle(cornerRadius: BorderRadius.sm)
                            .fill(accentColor)
                            .frame(width: trackWidth * max(0, min(progress, 1.0)), height: 8)
                    }
                }
            }
            .frame(height: 8)

            // Remaining / over caption
            Text(remainingText)
                .font(.appCaption1)
                .tracking(Typography.Tracking.caption1)
                .foregroundStyle(Color.appTextSecondary)
        }
    }

    // MARK: Helpers

    private var valueText: String {
        guard let goal else { return "\(formatted(current))\(unit)" }
        return "\(formatted(current)) / \(formatted(goal))\(unit)"
    }

    private var remainingText: String {
        guard let goal else { return "No goal set" }
        if isOverflow {
            return "\(formatted(current - goal))\(unit) over"
        } else {
            return "\(formatted(goal - current))\(unit) left"
        }
    }

    private func formatted(_ v: Double) -> String {
        // Show integer for kcal / whole-gram values
        String(Int(v.rounded()))
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: Spacing.xl) {
        MacroProgressBar(label: "Calories", current: 1350, goal: 2000,
                         accentColor: .caloriesAccent, overflowColor: .caloriesOverflow, unit: " cal")
        MacroProgressBar(label: "Protein", current: 210, goal: 150,
                         accentColor: .proteinAccent, overflowColor: .proteinOverflow, unit: "g")
        MacroProgressBar(label: "Carbs", current: 80, goal: 200,
                         accentColor: .carbsAccent, overflowColor: .carbsOverflow, unit: "g")
        MacroProgressBar(label: "Fat", current: 55, goal: nil,
                         accentColor: .fatAccent, overflowColor: .fatOverflow, unit: "g")
    }
    .padding()
}
