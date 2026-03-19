import SwiftUI

// MARK: - Layout 1: Bars

/// Four horizontal progress bars stacked vertically.
private struct LayoutBars: View {
    let totals: Macros
    let goals:  DailyGoal

    var body: some View {
        VStack(spacing: Spacing.md) {
            MacroProgressBar(label: "Calories", current: totals.calories,
                             goal: goals.calories,
                             accentColor: .caloriesAccent, overflowColor: .caloriesOverflow,
                             unit: " cal")
            MacroProgressBar(label: "Protein",  current: totals.proteinG,
                             goal: goals.proteinG,
                             accentColor: .proteinAccent, overflowColor: .proteinOverflow,
                             unit: "g")
            MacroProgressBar(label: "Carbs",    current: totals.carbsG,
                             goal: goals.carbsG,
                             accentColor: .carbsAccent, overflowColor: .carbsOverflow,
                             unit: "g")
            MacroProgressBar(label: "Fat",      current: totals.fatG,
                             goal: goals.fatG,
                             accentColor: .fatAccent, overflowColor: .fatOverflow,
                             unit: "g")
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Layout 2: Nested Rings

/// Large calorie ring centered, three smaller P/C/F rings below.
private struct LayoutNestedRings: View {
    let totals: Macros
    let goals:  DailyGoal

    private let bigSize:   CGFloat = 156
    private let bigSW:     CGFloat = 11
    private let smallSize: CGFloat = 80
    private let smallSW:   CGFloat = 6

    var body: some View {
        VStack(spacing: Spacing.lg) {
            // Large calorie ring
            ZStack {
                ringTrackAndFill(current: totals.calories,
                                 goal:    goals.calories,
                                 accent:  .caloriesAccent,
                                 overflow: .caloriesOverflow,
                                 size:    bigSize, sw: bigSW)

                // Center text
                VStack(spacing: 2) {
                    Text("CALORIES")
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(0.8)
                        .foregroundStyle(Color.appTextTertiary)
                    let cal = Int(totals.calories)
                    let calGoal = Int(goals.calories)
                    Text("\(cal) / \(calGoal)")
                        .font(.appCallout)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.appText)
                }
            }
            .frame(width: bigSize, height: bigSize)

            // Three small rings: P · C · F
            HStack(spacing: Spacing.xl) {
                smallRingWithLabel(label: "P",
                                   current: totals.proteinG, goal: goals.proteinG,
                                   accent: .proteinAccent, overflow: .proteinOverflow)
                smallRingWithLabel(label: "C",
                                   current: totals.carbsG, goal: goals.carbsG,
                                   accent: .carbsAccent, overflow: .carbsOverflow)
                smallRingWithLabel(label: "F",
                                   current: totals.fatG, goal: goals.fatG,
                                   accent: .fatAccent, overflow: .fatOverflow)
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func smallRingWithLabel(
        label: String,
        current: Double, goal: Double,
        accent: Color, overflow: Color
    ) -> some View {
        VStack(spacing: 4) {
            ZStack {
                ringTrackAndFill(current: current, goal: goal,
                                 accent: accent, overflow: overflow,
                                 size: smallSize, sw: smallSW)

                // Ratio center text
                let cur  = Int(current.rounded())
                let gInt = Int(goal)
                Text(goal > 0 ? "\(cur)/\(gInt)" : "\(cur)")
                    .font(.appCaption1)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.appText)
                    .minimumScaleFactor(0.6)
            }
            .frame(width: smallSize, height: smallSize)

            Text(label)
                .font(.appCaption2)
                .tracking(Typography.Tracking.caption2)
                .foregroundStyle(Color.appTextSecondary)
        }
    }

    @ViewBuilder
    private func ringTrackAndFill(
        current: Double, goal: Double,
        accent: Color, overflow: Color,
        size: CGFloat, sw: CGFloat
    ) -> some View {
        let progress     = goal > 0 ? current / goal : 0
        let fillTrim     = min(progress, 1.0)
        let overflowTrim = max(progress - 1.0, 0)

        ZStack {
            Circle()
                .stroke(Color.progressTrack, lineWidth: sw)
                .frame(width: size, height: size)

            Circle()
                .trim(from: 0, to: fillTrim)
                .stroke(accent, style: StrokeStyle(lineWidth: sw, lineCap: .round))
                .frame(width: size, height: size)
                .rotationEffect(.degrees(-90))

            if overflowTrim > 0 {
                Circle()
                    .trim(from: fillTrim, to: fillTrim + overflowTrim)
                    .stroke(overflow, style: StrokeStyle(lineWidth: sw, lineCap: .round))
                    .frame(width: size, height: size)
                    .rotationEffect(.degrees(-90))
            }
        }
    }
}

// MARK: - Layout 3: Activity Rings

/// Four concentric rings (cal → protein → carbs → fat outer to inner).
/// Stats are shown to the right of the ring cluster.
private struct LayoutActivityRings: View {
    let totals: Macros
    let goals:  DailyGoal

    private let outerSize:   CGFloat = 176
    private let strokeWidth: CGFloat = 14
    private let ringGap:     CGFloat = 3

    // Frame sizes for each ring (outer → inner)
    private var frameSizes: [CGFloat] {
        let step = strokeWidth + ringGap
        return [
            outerSize,
            outerSize - step * 2,
            outerSize - step * 4,
            outerSize - step * 6,
        ]
    }

    private struct RingData {
        let current: Double
        let goal: Double
        let accent: Color
        let overflow: Color
        let frameSize: CGFloat
    }

    private var rings: [RingData] {
        [
            RingData(current: totals.calories, goal: goals.calories,
                     accent: .caloriesAccent, overflow: .caloriesOverflow, frameSize: frameSizes[0]),
            RingData(current: totals.proteinG, goal: goals.proteinG,
                     accent: .proteinAccent, overflow: .proteinOverflow, frameSize: frameSizes[1]),
            RingData(current: totals.carbsG, goal: goals.carbsG,
                     accent: .carbsAccent, overflow: .carbsOverflow, frameSize: frameSizes[2]),
            RingData(current: totals.fatG, goal: goals.fatG,
                     accent: .fatAccent, overflow: .fatOverflow, frameSize: frameSizes[3]),
        ]
    }

    private struct StatData {
        let label: String
        let current: Int
        let goal: Double
        let unit: String
    }

    private var stats: [StatData] {
        [
            StatData(label: "CAL", current: Int(totals.calories.rounded()), goal: goals.calories, unit: ""),
            StatData(label: "P",   current: Int(totals.proteinG.rounded()),  goal: goals.proteinG, unit: "g"),
            StatData(label: "C",   current: Int(totals.carbsG.rounded()),    goal: goals.carbsG,   unit: "g"),
            StatData(label: "F",   current: Int(totals.fatG.rounded()),      goal: goals.fatG,     unit: "g"),
        ]
    }

    var body: some View {
        HStack(alignment: .center, spacing: Spacing.sm) {
            // Concentric rings
            ZStack {
                ForEach(Array(rings.enumerated()), id: \.offset) { _, ring in
                    concentricRing(ring: ring)
                }
            }
            .frame(width: outerSize, height: outerSize)

            Spacer()

            // Stats column
            VStack(alignment: .leading, spacing: Spacing.sm) {
                ForEach(Array(stats.enumerated()), id: \.offset) { _, stat in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(stat.label)
                            .font(.system(size: 11, weight: .semibold))
                            .tracking(0.8)
                            .foregroundStyle(Color.appTextTertiary)
                        let valueStr = stat.goal > 0
                            ? "\(stat.current)/\(Int(stat.goal))\(stat.unit)"
                            : "\(stat.current)\(stat.unit)"
                        Text(valueStr)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Color.appText)
                    }
                }
            }
            .padding(.trailing, Spacing.lg)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func concentricRing(ring: RingData) -> some View {
        let progress     = ring.goal > 0 ? min(ring.current / ring.goal, 1.2) : 0
        let fillTrim     = min(progress, 1.0)
        let overflowTrim = max(progress - 1.0, 0)

        ZStack {
            Circle()
                .stroke(Color.progressTrack, lineWidth: strokeWidth)
                .frame(width: ring.frameSize, height: ring.frameSize)

            if fillTrim > 0 {
                Circle()
                    .trim(from: 0, to: fillTrim)
                    .stroke(ring.accent,
                            style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round))
                    .frame(width: ring.frameSize, height: ring.frameSize)
                    .rotationEffect(.degrees(-90))
            }

            if overflowTrim > 0 {
                Circle()
                    .trim(from: fillTrim, to: fillTrim + overflowTrim)
                    .stroke(ring.overflow,
                            style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round))
                    .frame(width: ring.frameSize, height: ring.frameSize)
                    .rotationEffect(.degrees(-90))
            }
        }
    }
}

// MARK: - DashboardMacroSingleLayout (public entry point)

/// Switches between the three layout variants based on `layoutId`.
/// Shows a placeholder when goals are nil.
struct DashboardMacroSingleLayout: View {
    let layoutId: String
    let totals:   Macros
    let goals:    DailyGoal?

    var body: some View {
        if let goals {
            switch layoutId {
            case "nested-rings":
                LayoutNestedRings(totals: totals, goals: goals)
            case "activity-rings":
                LayoutActivityRings(totals: totals, goals: goals)
            default:
                LayoutBars(totals: totals, goals: goals)
            }
        } else {
            Text("Set goals to see progress")
                .font(.appSubhead)
                .foregroundStyle(Color.appTextSecondary)
                .frame(maxWidth: .infinity, minHeight: 100)
                .multilineTextAlignment(.center)
        }
    }
}

// MARK: - Preview

#Preview("Bars") {
    DashboardMacroSingleLayout(
        layoutId: "bars",
        totals: Macros(calories: 1350, proteinG: 95, carbsG: 160, fatG: 45),
        goals:  DailyGoal(id: "1", calories: 2000, proteinG: 150, carbsG: 200, fatG: 65))
    .padding()
}

#Preview("Nested rings") {
    DashboardMacroSingleLayout(
        layoutId: "nested-rings",
        totals: Macros(calories: 1350, proteinG: 95, carbsG: 160, fatG: 45),
        goals:  DailyGoal(id: "1", calories: 2000, proteinG: 150, carbsG: 200, fatG: 65))
    .padding()
}

#Preview("Activity rings") {
    DashboardMacroSingleLayout(
        layoutId: "activity-rings",
        totals: Macros(calories: 1350, proteinG: 95, carbsG: 160, fatG: 45),
        goals:  DailyGoal(id: "1", calories: 2000, proteinG: 150, carbsG: 200, fatG: 65))
    .padding()
}
