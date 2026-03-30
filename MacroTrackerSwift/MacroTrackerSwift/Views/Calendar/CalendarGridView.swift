import SwiftUI

struct CalendarGridView: View {
    @Environment(CalendarStore.self) private var calendarStore
    @Environment(DateStore.self) private var dateStore

    @Binding var isExpanded: Bool

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)
    private let weekdays = ["S", "M", "T", "W", "T", "F", "S"]

    var body: some View {
        VStack(spacing: Spacing.sm) {
            // Header with month navigation
            CalendarHeaderView(
                month: calendarStore.displayedMonth,
                streak: calendarStore.currentStreak,
                onPrevious: { changeMonth(-1) },
                onNext: { changeMonth(1) })

            // Weekday labels
            HStack(spacing: 0) {
                ForEach(weekdays, id: \.self) { day in
                    Text(day)
                        .font(.appCaption2)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.appTextTertiary)
                        .frame(maxWidth: .infinity)
                }
            }

            // Day grid
            LazyVGrid(columns: columns, spacing: Spacing.xs) {
                ForEach(daysInGrid, id: \.self) { date in
                    CalendarDayCell(
                        date: date,
                        isCurrentMonth: isInCurrentMonth(date),
                        isToday: isToday(date),
                        isSelected: isSelected(date),
                        summary: calendarStore.summaries[isoString(from: date)]
                    ) {
                        dateStore.setDate(isoString(from: date))
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            isExpanded = false
                        }
                    }
                }
            }
        }
        .padding(Spacing.lg)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        .task {
            await calendarStore.fetchMonth(calendarStore.displayedMonth)
        }
    }

    // MARK: - Month Navigation

    private func changeMonth(_ delta: Int) {
        let cal = Calendar.current
        if let newMonth = cal.date(byAdding: .month, value: delta, to: calendarStore.displayedMonth) {
            calendarStore.displayedMonth = newMonth
            Task { await calendarStore.fetchMonth(newMonth) }
        }
    }

    // MARK: - Grid Data

    private var daysInGrid: [Date] {
        let cal = Calendar.current
        guard let monthInterval = cal.dateInterval(of: .month, for: calendarStore.displayedMonth) else {
            return []
        }

        let startOfMonth = monthInterval.start
        let endOfMonth = cal.date(byAdding: .day, value: -1, to: monthInterval.end)!

        // Pad to start of week
        let firstWeekday = cal.component(.weekday, from: startOfMonth)
        let paddedStart = cal.date(byAdding: .day, value: -(firstWeekday - 1), to: startOfMonth)!

        // Pad to end of week
        let lastWeekday = cal.component(.weekday, from: endOfMonth)
        let paddedEnd = cal.date(byAdding: .day, value: 7 - lastWeekday, to: endOfMonth)!

        var dates: [Date] = []
        var current = paddedStart
        while current <= paddedEnd {
            dates.append(current)
            current = cal.date(byAdding: .day, value: 1, to: current)!
        }
        return dates
    }

    // MARK: - Helpers

    private func isInCurrentMonth(_ date: Date) -> Bool {
        Calendar.current.isDate(date, equalTo: calendarStore.displayedMonth, toGranularity: .month)
    }

    private func isToday(_ date: Date) -> Bool {
        Calendar.current.isDateInToday(date)
    }

    private func isSelected(_ date: Date) -> Bool {
        isoString(from: date) == dateStore.selectedDate
    }

    private func isoString(from date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: date)
    }
}
