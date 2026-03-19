import SwiftUI

// MARK: - Ring Variant

enum RingVariant {
    case compact    // size=32, sw=3, no labels
    case `default`  // size=44, sw=4, labels shown
    case dashboard  // size=56, sw=6, labels shown
}

// MARK: - SingleMacroRing

/// One ring for a single macro (protein, carbs, or fat).
struct SingleMacroRing: View {
    let label:         String
    let current:       Double
    let goal:          Double?
    let accentColor:   Color
    let overflowColor: Color
    let variant:       RingVariant

    private var size: CGFloat {
        switch variant {
        case .compact:   return 32
        case .default:   return 44
        case .dashboard: return 56
        }
    }

    private var strokeWidth: CGFloat {
        switch variant {
        case .compact:   return 3
        case .default:   return 4
        case .dashboard: return 6
        }
    }

    private var showLabel: Bool {
        switch variant {
        case .compact:             return false
        case .default, .dashboard: return true
        }
    }

    private var progress: Double {
        guard let goal, goal > 0 else { return 0 }
        return current / goal
    }

    private var fillTrim: Double      { min(progress, 1.0) }
    private var overflowStart: Double { fillTrim }
    private var overflowTrim: Double  { max(progress - 1.0, 0) }

    var body: some View {
        VStack(spacing: 2) {
            ZStack {
                // Track
                Circle()
                    .stroke(Color.progressTrack, lineWidth: strokeWidth)
                    .frame(width: size, height: size)

                // Fill arc
                Circle()
                    .trim(from: 0, to: fillTrim)
                    .stroke(accentColor,
                            style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round))
                    .frame(width: size, height: size)
                    .rotationEffect(.degrees(-90))

                // Overflow arc (starts where fill ends)
                if overflowTrim > 0 {
                    Circle()
                        .trim(from: overflowStart, to: overflowStart + overflowTrim)
                        .stroke(overflowColor,
                                style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round))
                        .frame(width: size, height: size)
                        .rotationEffect(.degrees(-90))
                }
            }

            if showLabel {
                Text(label)
                    .font(.appCaption2)
                    .tracking(Typography.Tracking.caption2)
                    .foregroundStyle(Color.appTextSecondary)
            }
        }
    }
}

// MARK: - MacroRingProgress

/// Three macro rings (P/C/F) side by side plus a calorie summary line.
struct MacroRingProgress: View {
    let totals:  Macros
    let goals:   DailyGoal?
    let variant: RingVariant

    private var hSpacing: CGFloat {
        variant == .compact ? Spacing.xs : Spacing.sm
    }

    var body: some View {
        VStack(spacing: Spacing.sm) {
            HStack(spacing: hSpacing) {
                SingleMacroRing(
                    label:         "Protein",
                    current:       totals.proteinG,
                    goal:          goals?.proteinG,
                    accentColor:   .proteinAccent,
                    overflowColor: .proteinOverflow,
                    variant:       variant)

                SingleMacroRing(
                    label:         "Carbs",
                    current:       totals.carbsG,
                    goal:          goals?.carbsG,
                    accentColor:   .carbsAccent,
                    overflowColor: .carbsOverflow,
                    variant:       variant)

                SingleMacroRing(
                    label:         "Fat",
                    current:       totals.fatG,
                    goal:          goals?.fatG,
                    accentColor:   .fatAccent,
                    overflowColor: .fatOverflow,
                    variant:       variant)
            }

            if variant != .compact {
                let calGoal = Int(goals?.calories ?? 0)
                Text("\(Int(totals.calories)) / \(calGoal) cal")
                    .font(.appFootnote)
                    .tracking(Typography.Tracking.footnote)
                    .foregroundStyle(Color.appTextSecondary)
            }
        }
    }
}

// MARK: - Preview

#Preview("Default rings") {
    MacroRingProgress(
        totals: Macros(calories: 1350, proteinG: 95, carbsG: 160, fatG: 45),
        goals:  DailyGoal(id: "1", calories: 2000, proteinG: 150, carbsG: 200, fatG: 65),
        variant: .default)
    .padding()
}
