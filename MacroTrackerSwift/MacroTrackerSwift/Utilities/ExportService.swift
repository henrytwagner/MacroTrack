import SwiftUI

@MainActor
enum ExportService {
    static func renderDayImage(date: String, entries: [FoodEntry],
                                totals: Macros, goals: DailyGoal?) -> UIImage? {
        let view = ShareDayView(date: date, entries: entries, totals: totals, goals: goals)
        let renderer = ImageRenderer(content: view)
        renderer.scale = UIScreen.main.scale
        return renderer.uiImage
    }
}
