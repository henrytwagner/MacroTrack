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

    var isEmbedded: Bool = false

    @State private var isExpanded:    Bool = false
    @State private var showLogSheet:  Bool = false

    private var savedMeal: SavedMeal? {
        guard let id = savedMealId else { return nil }
        return MealsStore.shared.meal(for: id)
    }

    /// Infers the logged portion as a display string (e.g. "1×", "0.5×") by comparing
    /// the sum of entry calories to the meal template total.
    private var portionLabel: String? {
        guard let meal = savedMeal, meal.totalMacros.calories > 0 else { return nil }
        let logged = entries.reduce(0.0) { $0 + $1.calories }
        let ratio  = (logged / meal.totalMacros.calories * 4).rounded() / 4
        guard ratio > 0 else { return nil }
        if ratio == ratio.rounded() { return "\(Int(ratio))×" }
        return String(format: "%.2g×", ratio)
    }

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
                    if idx > 0 { Divider().padding(.leading, Spacing.xl) }
                    FoodEntryRow(
                        entry:             entry,
                        onDelete:          { onDelete(entry.id) },
                        onTap:             { onTap(entry) },
                        isSelectionMode:   isSelectionMode,
                        isSelected:        selectedIds.contains(entry.id),
                        onSelect:          { onSelect(entry.id) },
                        horizontalPadding: Spacing.xxxl)
                }
            }
        }
        .background(isEmbedded ? Color.clear : Color.appSurface)
        .clipShape(isEmbedded ? AnyShape(Rectangle()) : AnyShape(RoundedRectangle(cornerRadius: BorderRadius.md)))
        .onChange(of: isSelectionMode) { _, newVal in
            if !newVal { isExpanded = false }
        }
        .sheet(isPresented: $showLogSheet) {
            if let meal = savedMeal {
                LogMealSheet(
                    meal:             meal,
                    onLogged:         { showLogSheet = false },
                    existingEntryIds: entries.map(\.id),
                    onDeleteEntry:    onDelete)
            }
        }
    }

    // MARK: - Header

    private var headerRow: some View {
        HStack(spacing: Spacing.md) {
            // Selection mode checkbox
            if isSelectionMode {
                Image(systemName: allSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 20))
                    .foregroundStyle(allSelected ? Color.appTint : Color.appTextTertiary)
                    .animation(.spring(response: 0.2), value: allSelected)
            }

            // Left: name + chevron + item count — tap toggles expand (or selects all in selection mode)
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                if isSelectionMode {
                    withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
                        for entry in entries { onSelect(entry.id) }
                    }
                } else {
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.75)) {
                        isExpanded.toggle()
                    }
                }
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                        Text(mealName)
                            .font(.appBody)
                            .fontWeight(.medium)
                            .foregroundStyle(Color.appText)
                            .lineLimit(1)
                            .layoutPriority(1)
                        if !isSelectionMode {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(Color.appTextTertiary)
                                .rotationEffect(.degrees(isExpanded ? 90 : 0))
                                .animation(.spring(response: 0.25, dampingFraction: 0.75), value: isExpanded)
                        }
                    }
                    HStack(spacing: Spacing.xs) {
                        Text("\(entries.count) item\(entries.count == 1 ? "" : "s")")
                        if let portion = portionLabel {
                            Text("·")
                            Text(portion)
                        }
                    }
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextTertiary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Spacer()

            MacroNutrientsColumn(macros: totalMacros)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
        .contentShape(Rectangle())
        .onTapGesture {
            guard !isSelectionMode, savedMeal != nil else { return }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showLogSheet = true
        }
    }
}
