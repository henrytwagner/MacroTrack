import Foundation
import Observation

// MARK: - Date Helpers

nonisolated func todayString() -> String {
    let d = Date()
    let cal = Calendar.current
    let y = cal.component(.year,  from: d)
    let m = cal.component(.month, from: d)
    let day = cal.component(.day, from: d)
    return String(format: "%04d-%02d-%02d", y, m, day)
}

private nonisolated func addDays(_ dateStr: String, _ n: Int) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.locale = Locale(identifier: "en_US_POSIX")
    guard let date = formatter.date(from: dateStr) else { return dateStr }
    let result = Calendar.current.date(byAdding: .day, value: n, to: date) ?? date
    return formatter.string(from: result)
}

// MARK: - DateStore

/// Tracks the currently selected date across all tabs.
/// Direct port of mobile/stores/dateStore.ts.
@Observable @MainActor
final class DateStore {
    static let shared = DateStore()

    var selectedDate: String = todayString()

    private init() {}

    func setDate(_ date: String) {
        selectedDate = date
    }

    func goToPreviousDay() {
        selectedDate = addDays(selectedDate, -1)
    }

    func goToNextDay() {
        selectedDate = addDays(selectedDate, +1)
    }
}
