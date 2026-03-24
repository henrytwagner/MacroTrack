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

/// P/C/F rings (optionally + Cal) with tap-to-expand detail.
/// Tapping any ring expands all columns to show current/goal + remaining — same format as the Log tab pill.
/// Pass `showCalorieRing: true` to prepend a calorie ring and suppress the text summary.
struct MacroRingProgress: View {
    let totals:          Macros
    let goals:           DailyGoal?
    let variant:         RingVariant
    var showCalorieRing: Bool = false

    @State private var isExpanded: Bool = false

    // MARK: - Ring data model

    private struct RingData: Identifiable {
        let id:            String
        let label:         String
        let current:       Double
        let goal:          Double?
        let unit:          String
        let accentColor:   Color
        let overflowColor: Color
    }

    private var rings: [RingData] {
        var r: [RingData] = []
        if showCalorieRing {
            r.append(RingData(id: "Cal", label: "Cal",
                              current: totals.calories, goal: goals?.calories,
                              unit: "", accentColor: .caloriesAccent, overflowColor: .caloriesOverflow))
        }
        r.append(RingData(id: "Pro", label: "Pro",
                          current: totals.proteinG, goal: goals?.proteinG,
                          unit: "g", accentColor: .proteinAccent, overflowColor: .proteinOverflow))
        r.append(RingData(id: "Carb", label: "Carb",
                          current: totals.carbsG,   goal: goals?.carbsG,
                          unit: "g", accentColor: .carbsAccent, overflowColor: .carbsOverflow))
        r.append(RingData(id: "Fat", label: "Fat",
                          current: totals.fatG,     goal: goals?.fatG,
                          unit: "g", accentColor: .fatAccent, overflowColor: .fatOverflow))
        return r
    }

    private var hSpacing: CGFloat {
        isExpanded ? Spacing.lg : (variant == .compact ? Spacing.xs : Spacing.sm)
    }

    // MARK: - Body

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                isExpanded.toggle()
            }
        } label: {
            if isExpanded {
                expandedContent
            } else {
                collapsedContent
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Collapsed

    private var collapsedContent: some View {
        VStack(spacing: Spacing.sm) {
            HStack(spacing: variant == .compact ? Spacing.xs : Spacing.sm) {
                ForEach(rings) { ring in
                    SingleMacroRing(
                        label:         ring.label,
                        current:       ring.current,
                        goal:          ring.goal,
                        accentColor:   ring.accentColor,
                        overflowColor: ring.overflowColor,
                        variant:       variant)
                }
            }

            if variant != .compact && !showCalorieRing {
                let calGoal = Int(goals?.calories ?? 0)
                Text("\(Int(totals.calories)) / \(calGoal) cal")
                    .font(.appFootnote)
                    .tracking(Typography.Tracking.footnote)
                    .foregroundStyle(Color.appTextSecondary)
            }
        }
    }

    // MARK: - Expanded (LogView pill column format)

    private var expandedContent: some View {
        HStack(spacing: Spacing.lg) {
            ForEach(rings) { ring in
                macroPillColumn(ring)
            }
        }
    }

    @ViewBuilder
    private func macroPillColumn(_ ring: RingData) -> some View {
        let goal      = ring.goal ?? 0
        let hasGoal   = goal > 0
        let remaining = goal - ring.current
        let remainText = remaining >= 0
            ? "\(Int(remaining.rounded()))\(ring.unit) left"
            : "\(Int((-remaining).rounded()))\(ring.unit) over"

        VStack(spacing: 0) {
            SingleMacroRing(
                label:         ring.label,
                current:       ring.current,
                goal:          ring.goal,
                accentColor:   ring.accentColor,
                overflowColor: ring.overflowColor,
                variant:       .compact)
            Spacer().frame(height: Spacing.xs)
            Text(hasGoal
                 ? "\(Int(ring.current.rounded()))/\(Int(goal.rounded()))"
                 : "\(Int(ring.current.rounded()))")
                .font(.appCaption2)
                .foregroundStyle(Color.appTextSecondary)
                .lineLimit(1)
            if hasGoal {
                Spacer().frame(height: Spacing.xs)
                Text(remainText)
                    .font(.appCaption2)
                    .foregroundStyle(remaining < 0 ? ring.overflowColor : Color.appTextTertiary)
                    .lineLimit(1)
            }
        }
    }
}

// MARK: - Preview

#Preview("Default rings") {
    VStack(spacing: 32) {
        MacroRingProgress(
            totals: Macros(calories: 1350, proteinG: 95, carbsG: 160, fatG: 45),
            goals:  DailyGoal(id: "1", calories: 2000, proteinG: 150, carbsG: 200, fatG: 65),
            variant: .default)

        MacroRingProgress(
            totals: Macros(calories: 1350, proteinG: 95, carbsG: 160, fatG: 45),
            goals:  DailyGoal(id: "1", calories: 2000, proteinG: 150, carbsG: 200, fatG: 65),
            variant: .default,
            showCalorieRing: true)
    }
    .padding()
}
