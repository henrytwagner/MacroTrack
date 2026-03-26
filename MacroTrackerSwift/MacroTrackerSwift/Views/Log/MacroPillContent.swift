import SwiftUI

// MARK: - MacroPillContent
//
// Stateless pill body shared by the Log scroll overlay and the Kitchen Mode
// persistent overlay.  The caller owns the AppStorage index and the
// expanded/icon toggle — this view just renders the appropriate style.
//
// isIcon: false → detailed view (rings+stats / 4 rings / bars)
// isIcon: true  → icon-only view (pure geometry, no labels)

struct MacroPillContent: View {
    let totals:     Macros
    let goals:      DailyGoal
    let styleIndex: Int
    let isIcon:     Bool

    var body: some View {
        if isIcon { iconContent } else { detailedContent }
    }

    // MARK: - Detailed

    @ViewBuilder private var detailedContent: some View {
        switch styleIndex {
        case 1:  pill1RingRow
        case 2:  pill2Bars
        default: pill0Grid
        }
    }

    // Style 0 — concentric ring cluster + 2×2 stat grid
    private var pill0Grid: some View {
        let outerSize:   CGFloat = 76
        let sw:          CGFloat = 6
        let step                 = sw + 3
        let clusterFrame         = outerSize + sw
        return HStack(alignment: .center, spacing: Spacing.md) {
            ZStack {
                concentricArc(current: totals.calories, goal: goals.calories,
                              accent: .caloriesAccent, overflow: .caloriesOverflow,
                              diameter: outerSize,          sw: sw)
                concentricArc(current: totals.proteinG, goal: goals.proteinG,
                              accent: .proteinAccent,  overflow: .proteinOverflow,
                              diameter: outerSize - step*2, sw: sw)
                concentricArc(current: totals.carbsG,   goal: goals.carbsG,
                              accent: .carbsAccent,    overflow: .carbsOverflow,
                              diameter: outerSize - step*4, sw: sw)
                concentricArc(current: totals.fatG,     goal: goals.fatG,
                              accent: .fatAccent,      overflow: .fatOverflow,
                              diameter: outerSize - step*6, sw: sw)
            }
            .frame(width: clusterFrame, height: clusterFrame)
            Grid(horizontalSpacing: Spacing.md, verticalSpacing: Spacing.sm) {
                GridRow {
                    statCell("CAL",  totals.calories, goals.calories, .caloriesAccent, .caloriesOverflow, "")
                    statCell("PRO",  totals.proteinG, goals.proteinG, .proteinAccent,  .proteinOverflow,  "g")
                }
                GridRow {
                    statCell("CARB", totals.carbsG,   goals.carbsG,   .carbsAccent,    .carbsOverflow,    "g")
                    statCell("FAT",  totals.fatG,     goals.fatG,     .fatAccent,      .fatOverflow,      "g")
                }
            }
        }
    }

    // Style 1 — 4 rings in a row, remaining value inside
    private var pill1RingRow: some View {
        HStack(spacing: Spacing.sm) {
            labelledRing("Cal",  totals.calories, goals.calories, .caloriesAccent, .caloriesOverflow, "")
            labelledRing("Pro",  totals.proteinG, goals.proteinG, .proteinAccent,  .proteinOverflow,  "g")
            labelledRing("Carb", totals.carbsG,   goals.carbsG,   .carbsAccent,    .carbsOverflow,    "g")
            labelledRing("Fat",  totals.fatG,     goals.fatG,     .fatAccent,      .fatOverflow,      "g")
        }
    }

    // Style 2 — 4 mini labelled bars
    private var pill2Bars: some View {
        VStack(spacing: Spacing.xs) {
            miniBar("Cal",  totals.calories, goals.calories, .caloriesAccent, .caloriesOverflow, " cal")
            miniBar("Pro",  totals.proteinG, goals.proteinG, .proteinAccent,  .proteinOverflow,  "g")
            miniBar("Carb", totals.carbsG,   goals.carbsG,   .carbsAccent,    .carbsOverflow,    "g")
            miniBar("Fat",  totals.fatG,     goals.fatG,     .fatAccent,      .fatOverflow,      "g")
        }
    }

    // MARK: - Icon

    @ViewBuilder private var iconContent: some View {
        switch styleIndex {
        case 1:  icon1Arcs
        case 2:  icon2Columns
        default: icon0Rings
        }
    }

    // Icon 0 — standalone concentric rings, no text
    private var icon0Rings: some View {
        let outerSize:   CGFloat = 80
        let sw:          CGFloat = 7
        let step                 = sw + 3
        let clusterFrame         = outerSize + sw
        return ZStack {
            concentricArc(current: totals.calories, goal: goals.calories,
                          accent: .caloriesAccent, overflow: .caloriesOverflow,
                          diameter: outerSize,          sw: sw)
            concentricArc(current: totals.proteinG, goal: goals.proteinG,
                          accent: .proteinAccent,  overflow: .proteinOverflow,
                          diameter: outerSize - step*2, sw: sw)
            concentricArc(current: totals.carbsG,   goal: goals.carbsG,
                          accent: .carbsAccent,    overflow: .carbsOverflow,
                          diameter: outerSize - step*4, sw: sw)
            concentricArc(current: totals.fatG,     goal: goals.fatG,
                          accent: .fatAccent,      overflow: .fatOverflow,
                          diameter: outerSize - step*6, sw: sw)
        }
        .frame(width: clusterFrame, height: clusterFrame)
    }

    // Icon 1 — 2×2 grid of ghost-track arcs (negative space = remaining)
    private var icon1Arcs: some View {
        Grid(horizontalSpacing: Spacing.sm, verticalSpacing: Spacing.sm) {
            GridRow {
                ghostArc(totals.calories, goals.calories, .caloriesAccent, .caloriesOverflow)
                ghostArc(totals.proteinG, goals.proteinG, .proteinAccent,  .proteinOverflow)
            }
            GridRow {
                ghostArc(totals.carbsG,   goals.carbsG,   .carbsAccent,    .carbsOverflow)
                ghostArc(totals.fatG,     goals.fatG,     .fatAccent,      .fatOverflow)
            }
        }
    }

    // Icon 2 — 4 vertical fill columns (battery/EQ style)
    private var icon2Columns: some View {
        HStack(alignment: .bottom, spacing: 5) {
            fillColumn(totals.calories, goals.calories, .caloriesAccent, .caloriesOverflow)
            fillColumn(totals.proteinG, goals.proteinG, .proteinAccent,  .proteinOverflow)
            fillColumn(totals.carbsG,   goals.carbsG,   .carbsAccent,    .carbsOverflow)
            fillColumn(totals.fatG,     goals.fatG,     .fatAccent,      .fatOverflow)
        }
    }

    // MARK: - Primitive builders

    /// Concentric arc ring — shared by pill0Grid (detailed) and icon0Rings.
    @ViewBuilder
    private func concentricArc(
        current: Double, goal: Double,
        accent: Color, overflow: Color,
        diameter: CGFloat, sw: CGFloat
    ) -> some View {
        let progress     = goal > 0 ? current / goal : 0
        let fillTrim     = min(progress, 1.0)
        let overflowTrim = max(progress - 1.0, 0)
        ZStack {
            Circle()
                .stroke(Color.progressTrack, lineWidth: sw)
                .frame(width: diameter, height: diameter)
            if fillTrim > 0 {
                Circle()
                    .trim(from: 0, to: fillTrim)
                    .stroke(accent, style: StrokeStyle(lineWidth: sw, lineCap: .round))
                    .frame(width: diameter, height: diameter)
                    .rotationEffect(.degrees(-90))
            }
            if overflowTrim > 0 {
                Circle()
                    .trim(from: 0, to: overflowTrim)
                    .stroke(overflow, style: StrokeStyle(lineWidth: sw, lineCap: .butt))
                    .frame(width: diameter, height: diameter)
                    .rotationEffect(.degrees(-90))
                Circle()
                    .fill(overflow)
                    .frame(width: sw, height: sw)
                    .offset(x: diameter / 2)
                    .rotationEffect(.degrees(overflowTrim * 360 - 90))
            }
        }
    }

    /// 2×2 stat cell: label / remaining / ratio text.
    @ViewBuilder
    private func statCell(
        _ label: String, _ current: Double, _ goal: Double,
        _ accent: Color, _ overflow: Color, _ unit: String
    ) -> some View {
        let remaining = goal - current
        let isOver    = remaining < 0
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .tracking(0.5)
                .foregroundStyle(accent)
            Text(isOver
                 ? "\(Int((-remaining).rounded()))\(unit) over"
                 : "\(Int(remaining.rounded()))\(unit) left")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(isOver ? overflow : Color.appText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text("\(Int(current.rounded()))/\(Int(goal.rounded()))\(unit)")
                .font(.system(size: 9))
                .foregroundStyle(Color.appTextSecondary)
                .lineLimit(1)
        }
        .frame(alignment: .leading)
    }

    /// Ring with remaining value inside + label/status below (style 1 detailed).
    @ViewBuilder
    private func labelledRing(
        _ label: String, _ current: Double, _ goal: Double,
        _ accent: Color, _ overflow: Color, _ unit: String
    ) -> some View {
        let size:        CGFloat = 44
        let sw:          CGFloat = 5
        let progress     = goal > 0 ? current / goal : 0
        let fillTrim     = min(progress, 1.0)
        let overflowTrim = max(progress - 1.0, 0)
        let remaining    = goal - current
        let isOver       = remaining < 0
        VStack(spacing: 3) {
            ZStack {
                Circle()
                    .stroke(Color.progressTrack, lineWidth: sw)
                    .frame(width: size, height: size)
                if fillTrim > 0 {
                    Circle()
                        .trim(from: 0, to: fillTrim)
                        .stroke(accent, style: StrokeStyle(lineWidth: sw, lineCap: .round))
                        .frame(width: size, height: size)
                        .rotationEffect(.degrees(-90))
                }
                if overflowTrim > 0 {
                    Circle()
                        .trim(from: 0, to: overflowTrim)
                        .stroke(overflow, style: StrokeStyle(lineWidth: sw, lineCap: .butt))
                        .frame(width: size, height: size)
                        .rotationEffect(.degrees(-90))
                    Circle()
                        .fill(overflow)
                        .frame(width: sw, height: sw)
                        .offset(x: size / 2)
                        .rotationEffect(.degrees(overflowTrim * 360 - 90))
                }
                Text(isOver ? "+\(Int((-remaining).rounded()))" : "\(Int(remaining.rounded()))")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(isOver ? overflow : Color.appText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(width: size - sw * 2 - 4)
            }
            VStack(spacing: 1) {
                Text(label)
                    .font(.appCaption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(accent)
                Text(isOver ? "over" : "left")
                    .font(.appCaption2)
                    .foregroundStyle(Color.appTextTertiary)
            }
        }
    }

    /// Labelled mini progress bar (style 2 detailed).
    @ViewBuilder
    private func miniBar(
        _ label: String, _ current: Double, _ goal: Double,
        _ accent: Color, _ overflow: Color, _ unit: String
    ) -> some View {
        let progress  = goal > 0 ? current / goal : 0
        let isOver    = progress > 1.0
        let remaining = goal - current
        let barW: CGFloat = 88
        HStack(spacing: Spacing.xs) {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Color.appText)
                .frame(width: 28, alignment: .leading)
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color.progressTrack)
                    .frame(width: barW, height: 4)
                RoundedRectangle(cornerRadius: 2)
                    .fill(isOver ? overflow : accent)
                    .frame(width: barW * min(progress, 1.0), height: 4)
            }
            .frame(width: barW, height: 4)
            Text(isOver
                 ? "+\(Int((-remaining).rounded()))\(unit)"
                 : "\(Int(remaining.rounded()))\(unit)")
                .font(.system(size: 10))
                .foregroundStyle(isOver ? overflow : Color.appTextSecondary)
                .frame(width: 54, alignment: .trailing)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
    }

    /// Ghost-track arc (icon 1 — filled arc on faint track, negative space = remaining).
    @ViewBuilder
    private func ghostArc(
        _ current: Double, _ goal: Double, _ accent: Color, _ overflow: Color
    ) -> some View {
        let size:        CGFloat = 30
        let sw:          CGFloat = 4
        let progress     = goal > 0 ? current / goal : 0
        let fillTrim     = min(progress, 1.0)
        let overflowTrim = max(progress - 1.0, 0)
        ZStack {
            Circle()
                .stroke(Color.progressTrack.opacity(0.5), lineWidth: sw)
                .frame(width: size, height: size)
            if fillTrim > 0 {
                Circle()
                    .trim(from: 0, to: fillTrim)
                    .stroke(accent, style: StrokeStyle(lineWidth: sw, lineCap: .round))
                    .frame(width: size, height: size)
                    .rotationEffect(.degrees(-90))
            }
            if overflowTrim > 0 {
                Circle()
                    .trim(from: 0, to: overflowTrim)
                    .stroke(overflow, style: StrokeStyle(lineWidth: sw, lineCap: .butt))
                    .frame(width: size, height: size)
                    .rotationEffect(.degrees(-90))
                Circle()
                    .fill(overflow)
                    .frame(width: sw, height: sw)
                    .offset(x: size / 2)
                    .rotationEffect(.degrees(overflowTrim * 360 - 90))
            }
        }
    }

    /// Vertical fill column (icon 2 — battery/EQ style).
    @ViewBuilder
    private func fillColumn(
        _ current: Double, _ goal: Double, _ accent: Color, _ overflow: Color
    ) -> some View {
        let h:       CGFloat = 44
        let w:       CGFloat = 14
        let progress = goal > 0 ? current / goal : 0
        let isOver   = progress > 1.0
        let fillFrac = min(progress, 1.0)
        VStack(spacing: 3) {
            RoundedRectangle(cornerRadius: 2)
                .fill(overflow)
                .frame(width: w - 4, height: 4)
                .opacity(isOver ? 1 : 0)
            ZStack(alignment: .bottom) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color.progressTrack)
                    .frame(width: w, height: h)
                RoundedRectangle(cornerRadius: 3)
                    .fill(isOver ? overflow : accent)
                    .frame(width: w, height: h * fillFrac)
            }
            .frame(width: w, height: h)
        }
    }
}
