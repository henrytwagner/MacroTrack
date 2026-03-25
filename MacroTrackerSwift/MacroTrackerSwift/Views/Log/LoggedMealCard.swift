import SwiftUI

// MARK: - LoggedMealCard

/// Collapsible card showing a group of FoodEntries that were logged together as a saved meal.
/// Collapsed by default — header shows meal name + aggregate macros.
@MainActor
struct LoggedMealCard: View {
    let mealInstanceId:  String
    let savedMealId:     String?
    let entries:         [FoodEntry]
    let onDelete:        (String) -> Void
    let onTap:           (FoodEntry) -> Void
    let isSelectionMode: Bool
    let selectedIds:     Set<String>
    let onSelect:        (String) -> Void

    @State private var isExpanded: Bool = false

    // Look up the meal name via the singleton — @Observable tracks this automatically.
    private var mealName: String {
        guard let id = savedMealId else { return "Meal" }
        return MealsStore.shared.meal(for: id)?.name ?? "Meal"
    }

    private var totalMacros: Macros {
        entries.reduce(.zero) { acc, e in
            Macros(calories: acc.calories + e.calories,
                   proteinG: acc.proteinG + e.proteinG,
                   carbsG:   acc.carbsG   + e.carbsG,
                   fatG:     acc.fatG     + e.fatG)
        }
    }

    private var allSelected: Bool {
        !entries.isEmpty && entries.allSatisfy { selectedIds.contains($0.id) }
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            headerRow

            if isExpanded {
                Divider().padding(.leading, Spacing.lg)
                ForEach(Array(entries.enumerated()), id: \.element.id) { idx, entry in
                    if idx > 0 { Divider().padding(.leading, Spacing.lg + 28) }
                    FoodEntryRow(
                        entry:           entry,
                        onDelete:        { onDelete(entry.id) },
                        onTap:           { onTap(entry) },
                        isSelectionMode: isSelectionMode,
                        isSelected:      selectedIds.contains(entry.id),
                        onSelect:        { onSelect(entry.id) })
                }
            }
        }
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
        .onChange(of: isSelectionMode) { _, newVal in
            if !newVal { isExpanded = false }
        }
    }

    // MARK: - Header

    private var headerRow: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            if isSelectionMode {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
                    for entry in entries { onSelect(entry.id) }
                }
            } else {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    isExpanded.toggle()
                }
            }
        } label: {
            HStack(spacing: Spacing.md) {
                // Selection mode: group checkbox
                if isSelectionMode {
                    Image(systemName: allSelected ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 20))
                        .foregroundStyle(allSelected ? Color.appTint : Color.appTextTertiary)
                        .animation(.spring(response: 0.2), value: allSelected)
                }

                Image(systemName: "fork.knife")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.appTextSecondary)
                    .frame(width: 20)

                VStack(alignment: .leading, spacing: 2) {
                    Text(mealName)
                        .font(.appBody)
                        .fontWeight(.medium)
                        .foregroundStyle(Color.appText)
                        .lineLimit(1)
                    Text("\(entries.count) item\(entries.count == 1 ? "" : "s")")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextSecondary)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(Int(totalMacros.calories.rounded())) cal")
                        .font(.appBody)
                        .fontWeight(.medium)
                        .foregroundStyle(Color.appText)
                    HStack(spacing: 6) {
                        Text("P \(Int(totalMacros.proteinG.rounded()))g")
                            .foregroundStyle(Color.proteinAccent)
                        Text("C \(Int(totalMacros.carbsG.rounded()))g")
                            .foregroundStyle(Color.carbsAccent)
                        Text("F \(Int(totalMacros.fatG.rounded()))g")
                            .foregroundStyle(Color.fatAccent)
                    }
                    .font(.appCaption2)
                }

                if !isSelectionMode {
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.appTextTertiary)
                        .animation(.spring(response: 0.3), value: isExpanded)
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.md)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
