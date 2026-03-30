import SwiftUI

struct CalendarDayCell: View {
    let date: Date
    let isCurrentMonth: Bool
    let isToday: Bool
    let isSelected: Bool
    let summary: DailySummaryItem?
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 2) {
                Text("\(Calendar.current.component(.day, from: date))")
                    .font(.appSubhead)
                    .fontWeight(isToday ? .bold : .regular)
                    .foregroundStyle(foregroundColor)

                // Adherence dot
                Circle()
                    .fill(dotColor)
                    .frame(width: 6, height: 6)
                    .opacity(summary != nil && (summary?.entryCount ?? 0) > 0 ? 1 : 0)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 40)
            .background(
                Circle()
                    .fill(isToday ? Color.appTint.opacity(0.15) : Color.clear)
                    .frame(width: 36, height: 36)
            )
        }
        .buttonStyle(.plain)
    }

    private var foregroundColor: Color {
        if isSelected { return Color.appTint }
        if !isCurrentMonth { return Color.appTextTertiary.opacity(0.4) }
        if isToday { return Color.appTint }
        return Color.appText
    }

    private var dotColor: Color {
        guard let s = summary, s.entryCount > 0 else { return .clear }

        // Check if goals were met
        if let gc = s.goalCalories, let gp = s.goalProteinG,
           let gca = s.goalCarbsG, let gf = s.goalFatG {
            let met = s.totalCalories <= gc * 1.05 &&
                      s.totalProteinG >= gp * 0.95 &&
                      s.totalCarbsG <= gca * 1.05 &&
                      s.totalFatG <= gf * 1.05
            return met ? Color.appSuccess : Color.appWarning
        }

        // No goals set — neutral indicator
        return Color.appTextTertiary
    }
}
