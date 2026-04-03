import SwiftUI
import UIKit

// MARK: - LogDateHeader

/// Date header for the Log tab with expandable inline calendar.
/// Shows "TODAY" / weekday overline + large "d MMMM" date string.
/// Left/right arrows for day navigation; tap date text to expand/collapse calendar.
@MainActor
struct LogDateHeader: View {
    @Environment(DateStore.self) private var dateStore
    @Environment(CalendarStore.self) private var calendarStore

    @State private var showCalendar = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 0) {
                // Date display — tap to toggle calendar
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showCalendar.toggle()
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(overlineText)
                            .font(.system(size: 13, weight: .semibold))
                            .tracking(1.2)
                            .foregroundStyle(Color.appTextTertiary)

                        HStack(spacing: Spacing.sm) {
                            Text(dateLine)
                                .font(.system(size: 24, weight: .medium))
                                .foregroundStyle(Color.appText)

                            Image(systemName: showCalendar ? "chevron.up" : "chevron.down")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Color.appTextTertiary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)

                // Previous day
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    dateStore.goToPreviousDay()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Color.appTextSecondary)
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(.plain)

                // Next day
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    dateStore.goToNextDay()
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Color.appTextSecondary)
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, Spacing.lg)
            .padding(.trailing, Spacing.sm)
            .padding(.top, Spacing.md)
            .padding(.bottom, Spacing.sm)

            // Expandable calendar
            if showCalendar {
                CalendarGridView(isExpanded: $showCalendar)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.bottom, Spacing.md)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }

    // MARK: - Helpers

    private var parsedDate: Date? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.date(from: dateStore.selectedDate)
    }

    private var isToday: Bool { dateStore.selectedDate == todayString() }

    private var overlineText: String {
        if isToday { return "TODAY" }
        guard let date = parsedDate else { return "" }
        let df = DateFormatter()
        df.dateFormat = "EEEE"
        return df.string(from: date).uppercased()
    }

    private var dateLine: String {
        guard let date = parsedDate else { return dateStore.selectedDate }
        let df = DateFormatter()
        df.dateFormat = "d MMMM"
        return df.string(from: date)
    }
}

// MARK: - Preview

#Preview {
    LogDateHeader()
        .environment(DateStore.shared)
        .environment(CalendarStore.shared)
        .background(Color.appBackground)
}
