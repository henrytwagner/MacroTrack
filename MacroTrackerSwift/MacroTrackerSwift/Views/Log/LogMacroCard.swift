import SwiftUI

// MARK: - LogMacroCard
//
// Long-press to cycle styles (0 → 1 → 2 → 0). Independent preference from Dashboard.
// Style 2 is the original Log progress-bar layout, preserved alongside the ring styles.

struct LogMacroCard: View {
    let totals: Macros
    let goals:  DailyGoal

    @AppStorage("logMacroStyleIndex") private var styleIndex: Int = 0
    @State private var pressing: Bool = false

    var body: some View {
        ZStack {
            switch styleIndex {
            case 1:  DashStyleLargeRings(totals: totals, goals: goals)
            case 2:  LogStyleBars(totals: totals, goals: goals)
            default: DashStyleActivityRings(totals: totals, goals: goals)
            }
        }
        .scaleEffect(pressing ? 0.97 : 1.0, anchor: .center)
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: pressing)
        .contentShape(Rectangle())
        .onLongPressGesture(minimumDuration: 0.45, pressing: { isPressing in
            withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) { pressing = isPressing }
        }) {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                pressing   = false
                styleIndex = (styleIndex + 1) % 3
            }
        }
    }
}

// MARK: - DashboardMacroCard
//
// Long-press to cycle styles (0 → 1 → 2 → 0). Independent preference from Log tab.

struct DashboardMacroCard: View {
    let totals: Macros
    let goals:  DailyGoal

    @AppStorage("dashboardMacroStyleIndex") private var styleIndex: Int = 0
    @State private var pressing: Bool = false

    var body: some View {
        ZStack {
            switch styleIndex {
            case 1:  DashStyleLargeRings(totals: totals, goals: goals)
            case 2:  DashStyleCompactBars(totals: totals, goals: goals)
            default: DashStyleActivityRings(totals: totals, goals: goals)
            }
        }
        .scaleEffect(pressing ? 0.97 : 1.0, anchor: .center)
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: pressing)
        .contentShape(Rectangle())
        .onLongPressGesture(minimumDuration: 0.45, pressing: { isPressing in
            withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) { pressing = isPressing }
        }) {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                pressing   = false
                styleIndex = (styleIndex + 1) % 3
            }
        }
    }
}

// MARK: - Style 0: Concentric Activity Rings

private struct DashStyleActivityRings: View {
    let totals: Macros
    let goals:  DailyGoal

    // outerSize is the arc path diameter; visual extent = outerSize + strokeWidth
    // (stroke renders centered on path: half inside, half outside — so outer edge = outerSize + strokeWidth/2 per side)
    private let outerSize:   CGFloat = 200
    private let strokeWidth: CGFloat = 16
    private let ringGap:     CGFloat = 4

    private var frameSizes: [CGFloat] {
        let step = strokeWidth + ringGap
        return [outerSize, outerSize - step * 2, outerSize - step * 4, outerSize - step * 6]
    }

    // Frame the ZStack at outerSize + strokeWidth so the stroke bleed is fully contained
    // and doesn't get clipped by the TabView boundary
    private var clusterFrame: CGFloat { outerSize + strokeWidth }

    private struct RingInfo {
        let label:    String
        let current:  Double
        let goal:     Double
        let unit:     String
        let accent:   Color
        let overflow: Color
        let frame:    CGFloat
    }

    private var rings: [RingInfo] {
        [
            RingInfo(label: "CAL",  current: totals.calories, goal: goals.calories, unit: "",
                     accent: .caloriesAccent, overflow: .caloriesOverflow, frame: frameSizes[0]),
            RingInfo(label: "PRO",  current: totals.proteinG, goal: goals.proteinG, unit: "g",
                     accent: .proteinAccent, overflow: .proteinOverflow, frame: frameSizes[1]),
            RingInfo(label: "CARB", current: totals.carbsG,   goal: goals.carbsG,   unit: "g",
                     accent: .carbsAccent, overflow: .carbsOverflow, frame: frameSizes[2]),
            RingInfo(label: "FAT",  current: totals.fatG,     goal: goals.fatG,     unit: "g",
                     accent: .fatAccent, overflow: .fatOverflow, frame: frameSizes[3]),
        ]
    }

    var body: some View {
        HStack(alignment: .center, spacing: Spacing.md) {
            // ZStack framed at clusterFrame (outerSize + strokeWidth) so the stroke
            // is fully contained — prevents TabView from clipping the left edge
            ZStack {
                ForEach(Array(rings.enumerated()), id: \.offset) { _, ring in
                    concentricRing(ring: ring)
                }
            }
            .frame(width: clusterFrame, height: clusterFrame)

            // Stats column: remaining (primary) + consumed/goal (secondary)
            VStack(alignment: .leading, spacing: Spacing.sm) {
                ForEach(Array(rings.enumerated()), id: \.offset) { _, ring in
                    statRow(ring: ring)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func statRow(ring: RingInfo) -> some View {
        let remaining = ring.goal - ring.current
        let isOver    = remaining < 0
        VStack(alignment: .leading, spacing: 1) {
            Text(ring.label)
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.8)
                .foregroundStyle(ring.accent)
            Text(isOver
                 ? "\(formatted(-remaining))\(ring.unit) over"
                 : "\(formatted(remaining))\(ring.unit) left")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(isOver ? ring.overflow : Color.appText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text("\(formatted(ring.current))/\(formatted(ring.goal))\(ring.unit)")
                .font(.system(size: 11, weight: .regular))
                .foregroundStyle(Color.appTextSecondary)
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private func concentricRing(ring: RingInfo) -> some View {
        let progress     = ring.goal > 0 ? ring.current / ring.goal : 0
        let fillTrim     = min(progress, 1.0)
        let overflowTrim = max(progress - 1.0, 0)

        ZStack {
            Circle()
                .stroke(Color.progressTrack.opacity(0.6), lineWidth: strokeWidth)
                .frame(width: ring.frame, height: ring.frame)

            if fillTrim > 0 {
                Circle()
                    .trim(from: 0, to: fillTrim)
                    .stroke(ringFillGradient(accent: ring.accent),
                            style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round))
                    .frame(width: ring.frame, height: ring.frame)
                    .rotationEffect(.degrees(-90))
                    .shadow(color: ring.accent.opacity(0.45), radius: 8)
            }

            // Overflow darkening — angular gradient fades to transparent at the tip
            // so there is no hard edge where the overflow ends.
            if overflowTrim > 0 {
                let clamped = min(overflowTrim, 0.99)
                Circle()
                    .trim(from: 0, to: clamped)
                    .stroke(
                        AngularGradient(
                            stops: [
                                .init(color: Color.black.opacity(0.3), location: 0),
                                .init(color: Color.black.opacity(0.3), location: clamped * 0.8),
                                .init(color: .clear, location: clamped),
                            ],
                            center: .center,
                            startAngle: .degrees(0),
                            endAngle: .degrees(360)),
                        style: StrokeStyle(lineWidth: strokeWidth, lineCap: .butt))
                    .frame(width: ring.frame, height: ring.frame)
                    .rotationEffect(.degrees(-90))
            }
        }
    }

    private func formatted(_ v: Double) -> String { String(Int(v.rounded())) }
}

// MARK: - Style 1: 4 Large Separate Rings

private struct DashStyleLargeRings: View {
    let totals: Macros
    let goals:  DailyGoal

    private struct RingInfo: Identifiable {
        let id:       String
        let label:    String
        let current:  Double
        let goal:     Double
        let unit:     String
        let accent:   Color
        let overflow: Color
    }

    private var rings: [RingInfo] {
        [
            RingInfo(id: "cal",  label: "Cal",  current: totals.calories, goal: goals.calories,
                     unit: "",  accent: .caloriesAccent, overflow: .caloriesOverflow),
            RingInfo(id: "pro",  label: "Pro",  current: totals.proteinG, goal: goals.proteinG,
                     unit: "g", accent: .proteinAccent, overflow: .proteinOverflow),
            RingInfo(id: "carb", label: "Carb", current: totals.carbsG,   goal: goals.carbsG,
                     unit: "g", accent: .carbsAccent, overflow: .carbsOverflow),
            RingInfo(id: "fat",  label: "Fat",  current: totals.fatG,     goal: goals.fatG,
                     unit: "g", accent: .fatAccent, overflow: .fatOverflow),
        ]
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(rings) { ring in
                largeRingColumn(ring: ring)
                    .frame(maxWidth: .infinity)
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func largeRingColumn(ring: RingInfo) -> some View {
        let ringSize:    CGFloat = 72
        let strokeWidth: CGFloat = 8
        let progress     = ring.goal > 0 ? ring.current / ring.goal : 0
        let fillTrim     = min(progress, 1.0)
        let overflowTrim = max(progress - 1.0, 0)
        let remaining    = ring.goal - ring.current
        let isOver       = remaining < 0

        VStack(spacing: Spacing.xs) {
            ZStack {
                Circle()
                    .stroke(Color.progressTrack.opacity(0.6), lineWidth: strokeWidth)
                    .frame(width: ringSize, height: ringSize)

                if fillTrim > 0 {
                    Circle()
                        .trim(from: 0, to: fillTrim)
                        .stroke(ringFillGradient(accent: ring.accent),
                                style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round))
                        .frame(width: ringSize, height: ringSize)
                        .rotationEffect(.degrees(-90))
                        .shadow(color: ring.accent.opacity(0.45), radius: 7)
                }

                if overflowTrim > 0 {
                    let clamped = min(overflowTrim, 0.99)
                    Circle()
                        .trim(from: 0, to: clamped)
                        .stroke(
                            AngularGradient(
                                stops: [
                                    .init(color: Color.black.opacity(0.3), location: 0),
                                    .init(color: Color.black.opacity(0.3), location: clamped * 0.8),
                                    .init(color: .clear, location: clamped),
                                ],
                                center: .center,
                                startAngle: .degrees(0),
                                endAngle: .degrees(360)),
                            style: StrokeStyle(lineWidth: strokeWidth, lineCap: .butt))
                        .frame(width: ringSize, height: ringSize)
                        .rotationEffect(.degrees(-90))
                }

                // Remaining value inside ring
                VStack(spacing: 0) {
                    Text(isOver
                         ? "+\(Int((-remaining).rounded()))"
                         : "\(Int(remaining.rounded()))")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(isOver ? ring.overflow : Color.appText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    if !ring.unit.isEmpty {
                        Text(ring.unit)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(Color.appTextSecondary)
                    }
                }
                .frame(width: ringSize - strokeWidth * 2 - 6)
            }

            VStack(spacing: 1) {
                Text(ring.label)
                    .font(.appCaption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(ring.accent)
                Text(isOver ? "over" : "left")
                    .font(.appCaption2)
                    .foregroundStyle(Color.appTextTertiary)
            }
        }
    }
}

// MARK: - Style 2: Compact Progress Bars

private struct DashStyleCompactBars: View {
    let totals: Macros
    let goals:  DailyGoal

    var body: some View {
        VStack(spacing: Spacing.md) {
            compactBar(label: "Calories", current: totals.calories, goal: goals.calories,
                       accent: .caloriesAccent, overflow: .caloriesOverflow, unit: " cal")
            compactBar(label: "Protein",  current: totals.proteinG, goal: goals.proteinG,
                       accent: .proteinAccent,  overflow: .proteinOverflow,  unit: "g")
            compactBar(label: "Carbs",    current: totals.carbsG,   goal: goals.carbsG,
                       accent: .carbsAccent,    overflow: .carbsOverflow,    unit: "g")
            compactBar(label: "Fat",      current: totals.fatG,     goal: goals.fatG,
                       accent: .fatAccent,      overflow: .fatOverflow,      unit: "g")
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func compactBar(
        label: String, current: Double, goal: Double,
        accent: Color, overflow: Color, unit: String
    ) -> some View {
        let progress  = goal > 0 ? current / goal : 0
        let isOver    = progress > 1.0
        let remaining = goal - current

        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack {
                Text(label)
                    .font(.appSubhead)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.appText)
                Spacer()
                Text(isOver
                     ? "\(Int((-remaining).rounded()))\(unit) over"
                     : "\(Int(remaining.rounded()))\(unit) left")
                    .font(.appSubhead)
                    .foregroundStyle(isOver ? overflow : Color.appTextSecondary)
            }

            GeometryReader { geo in
                let trackWidth = geo.size.width
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: BorderRadius.sm)
                        .fill(Color.progressTrack)
                        .frame(height: 6)

                    if isOver {
                        let overflowFrac  = progress - 1.0
                        let totalParts    = 1.0 + overflowFrac
                        let goalWidth     = (1.0 / totalParts) * trackWidth
                        let overflowWidth = max(0, (overflowFrac / totalParts) * trackWidth - 2)
                        let r             = BorderRadius.sm

                        HStack(spacing: 0) {
                            UnevenRoundedRectangle(
                                topLeadingRadius: r, bottomLeadingRadius: r,
                                bottomTrailingRadius: 0, topTrailingRadius: 0)
                                .fill(accent)
                                .frame(width: goalWidth, height: 6)
                            Rectangle()
                                .fill(Color.appSurface)
                                .frame(width: 2, height: 6)
                            UnevenRoundedRectangle(
                                topLeadingRadius: 0, bottomLeadingRadius: 0,
                                bottomTrailingRadius: r, topTrailingRadius: r)
                                .fill(overflow)
                                .frame(width: overflowWidth, height: 6)
                        }
                    } else {
                        RoundedRectangle(cornerRadius: BorderRadius.sm)
                            .fill(accent)
                            .frame(width: trackWidth * max(0, min(progress, 1.0)), height: 6)
                    }
                }
            }
            .frame(height: 6)
        }
    }
}

// MARK: - Style 2 (Log): Original MacroProgressBar stack

private struct LogStyleBars: View {
    let totals: Macros
    let goals:  DailyGoal

    var body: some View {
        VStack(spacing: Spacing.md) {
            MacroProgressBar(
                label: "Calories", current: totals.calories, goal: goals.calories,
                accentColor: .caloriesAccent, overflowColor: .caloriesOverflow, unit: " cal")
            MacroProgressBar(
                label: "Protein",  current: totals.proteinG, goal: goals.proteinG,
                accentColor: .proteinAccent,  overflowColor: .proteinOverflow,  unit: "g")
            MacroProgressBar(
                label: "Carbs",    current: totals.carbsG,   goal: goals.carbsG,
                accentColor: .carbsAccent,    overflowColor: .carbsOverflow,    unit: "g")
            MacroProgressBar(
                label: "Fat",      current: totals.fatG,     goal: goals.fatG,
                accentColor: .fatAccent,      overflowColor: .fatOverflow,      unit: "g")
        }
        .frame(maxWidth: .infinity, alignment: .top)
    }
}

// MARK: - Ring Gradient Helpers

/// Fill arc gradient: bright highlight at start tapering to full accent — creates a "lit" effect.
/// startAngle: 0° aligns with rotationEffect(-90°) so location 0 lands at 12 o'clock.
private func ringFillGradient(accent: Color) -> AngularGradient {
    AngularGradient(
        stops: [
            .init(color: accent.opacity(0.55), location: 0),    // brighter start at 12 o'clock
            .init(color: accent,               location: 0.12), // quickly saturates
            .init(color: accent,               location: 0.85), // holds full color
            .init(color: accent.opacity(0.9),  location: 1.0),  // slight fade at tail
        ],
        center: .center,
        startAngle: .degrees(0), endAngle: .degrees(360))
}

// MARK: - Preview

#Preview {
    VStack(spacing: Spacing.xl) {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Today's Progress")
                .font(.appHeadline)
                .foregroundStyle(Color.appText)
            DashboardMacroCard(
                totals: Macros(calories: 465, proteinG: 248, carbsG: 266, fatG: 245),
                goals:  DailyGoal(id: "1", calories: 2590, proteinG: 194, carbsG: 296, fatG: 70))
        }
        .padding(Spacing.xl)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
    }
    .padding(Spacing.lg)
    .background(Color.appBackground)
}
