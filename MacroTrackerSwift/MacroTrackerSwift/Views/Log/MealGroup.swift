import SwiftUI

// MARK: - MealGroup

/// A meal section card: title + calorie total, then a rounded card of FoodEntryRows.
@MainActor
struct MealGroup: View {
    let meal:     MealLabel
    let entries:  [FoodEntry]
    let onDelete: (String) -> Void
    let onTap:    (FoodEntry) -> Void

    private var mealTitle: String {
        meal.rawValue.capitalized
    }

    private var calorieTotal: Int {
        Int(entries.reduce(0) { $0 + $1.calories }.rounded())
    }

    var body: some View {
        if entries.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                // Title row
                HStack {
                    Text(mealTitle)
                        .font(.appTitle3)
                        .foregroundStyle(Color.appText)

                    Spacer()

                    Text("\(calorieTotal) cal")
                        .font(.appSubhead)
                        .foregroundStyle(Color.appTextSecondary)
                }

                // Entries card
                VStack(spacing: 0) {
                    ForEach(Array(entries.enumerated()), id: \.element.id) { idx, entry in
                        FoodEntryRow(entry: entry, onDelete: { onDelete(entry.id) }, onTap: { onTap(entry) })
                        if idx < entries.count - 1 {
                            Divider()
                                .padding(.leading, Spacing.lg)
                        }
                    }
                }
                .background(Color.appSurface)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
            }
        }
    }
}
