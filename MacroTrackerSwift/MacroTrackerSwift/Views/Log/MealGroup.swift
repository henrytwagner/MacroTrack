import SwiftUI

// MARK: - MealGroup

/// A meal section card: title + calorie total, then entries.
/// Standalone entries appear as one grouped card (with dividers).
/// Entries logged as a saved meal appear as collapsible LoggedMealCards.
/// Both types are sorted chronologically by their earliest createdAt.
@MainActor
struct MealGroup: View {
    let meal:            MealLabel
    let entries:         [FoodEntry]
    let onDelete:        (String) -> Void
    let onTap:           (FoodEntry) -> Void
    let isSelectionMode: Bool
    let selectedIds:     Set<String>
    let onSelect:        (String) -> Void

    private var mealTitle: String { meal.rawValue.capitalized }

    private var calorieTotal: Int {
        Int(entries.reduce(0) { $0 + $1.calories }.rounded())
    }

    // MARK: - Content Sections

    /// Standalone entries (no mealInstanceId) — shown in a single card.
    private var standaloneEntries: [FoodEntry] {
        entries.filter { $0.mealInstanceId == nil }
    }

    /// Meal clusters — grouped by mealInstanceId.
    private struct Cluster {
        let instanceId:  String
        let savedMealId: String?
        let entries:     [FoodEntry]
        var sortKey:     String { entries.map(\.createdAt).min() ?? "" }
    }

    private var clusters: [Cluster] {
        let grouped = Dictionary(
            grouping: entries.filter { $0.mealInstanceId != nil },
            by: { $0.mealInstanceId! })
        return grouped.map { id, es in
            Cluster(instanceId:  id,
                    savedMealId: es.first?.savedMealId,
                    entries:     es.sorted { $0.createdAt < $1.createdAt })
        }
        .sorted { $0.sortKey < $1.sortKey }
    }

    // MARK: - Body

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

                // Standalone entries card (preserves original grouped look)
                if !standaloneEntries.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(Array(standaloneEntries.enumerated()), id: \.element.id) { idx, entry in
                            FoodEntryRow(
                                entry:           entry,
                                onDelete:        { onDelete(entry.id) },
                                onTap:           { onTap(entry) },
                                isSelectionMode: isSelectionMode,
                                isSelected:      selectedIds.contains(entry.id),
                                onSelect:        { onSelect(entry.id) })
                            if idx < standaloneEntries.count - 1 {
                                Divider().padding(.leading, Spacing.lg)
                            }
                        }
                    }
                    .background(Color.appSurface)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                }

                // Meal cluster cards
                ForEach(clusters, id: \.instanceId) { cluster in
                    LoggedMealCard(
                        mealInstanceId:  cluster.instanceId,
                        savedMealId:     cluster.savedMealId,
                        entries:         cluster.entries,
                        onDelete:        onDelete,
                        onTap:           onTap,
                        isSelectionMode: isSelectionMode,
                        selectedIds:     selectedIds,
                        onSelect:        onSelect)
                }
            }
        }
    }
}
