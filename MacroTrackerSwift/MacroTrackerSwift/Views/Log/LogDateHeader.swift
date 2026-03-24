import SwiftUI
import UIKit

// MARK: - LogDateHeader

/// Minimal date header for the Log tab.
/// Shows "TODAY" / weekday overline + large "d MMMM" date string.
/// Left/right arrows for day navigation; tap date text to open DatePicker sheet.
@MainActor
struct LogDateHeader: View {
    @Environment(DateStore.self) private var dateStore

    @State private var showPicker = false
    @State private var pickerDate: Date = Date()

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            // Date display — tap to open date picker
            Button {
                pickerDate = parsedDate ?? Date()
                showPicker = true
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(overlineText)
                        .font(.system(size: 13, weight: .semibold))
                        .tracking(1.2)
                        .foregroundStyle(Color.appTextTertiary)

                    Text(dateLine)
                        .font(.system(size: 24, weight: .medium))
                        .foregroundStyle(Color.appText)
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
        .sheet(isPresented: $showPicker) {
            datePickerSheet
        }
    }

    // MARK: - Date Picker Sheet

    private var datePickerSheet: some View {
        NavigationStack {
            DatePicker("Select Date", selection: $pickerDate, displayedComponents: .date)
                .datePickerStyle(.graphical)
                .padding(.horizontal)
                .navigationTitle("Select Date")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showPicker = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") {
                            dateStore.setDate(isoString(from: pickerDate))
                            showPicker = false
                        }
                    }
                }
        }
        .presentationDetents([.medium])
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

    private func isoString(from date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: date)
    }
}

// MARK: - Preview

#Preview {
    LogDateHeader()
        .environment(DateStore.shared)
        .background(Color.appBackground)
}
