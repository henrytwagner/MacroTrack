import SwiftUI
import UIKit

// MARK: - MealsListView

@MainActor
struct MealsListView: View {
    @Environment(MealsStore.self)    private var mealsStore
    @Environment(DailyLogStore.self) private var logStore
    @Environment(DateStore.self)     private var dateStore

    let onCreateMeal: () -> Void
    /// Called after a meal is successfully logged — used to dismiss FoodSearchView.
    let onDismiss: () -> Void
    /// When non-nil (ingredient-picker mode), tapping a meal calls this instead of opening LogMealSheet.
    var onPickMeal: ((SavedMeal) -> Void)? = nil

    @State private var logMealTarget: SavedMeal? = nil

    var body: some View {
        Group {
            if mealsStore.isLoading && mealsStore.meals.isEmpty {
                VStack {
                    tabPageHeader("Meals")
                        .padding(.top, Spacing.sm)
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if mealsStore.meals.isEmpty {
                emptyState
            } else {
                mealList
            }
        }
        .sheet(item: $logMealTarget) { meal in
            LogMealSheet(meal: meal, onLogged: {
                logMealTarget = nil
                onDismiss()
            })
            .environment(mealsStore)
            .environment(logStore)
            .environment(dateStore)
        }
        .task {
            if mealsStore.meals.isEmpty {
                await mealsStore.fetch()
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 0) {
            tabPageHeader("Meals")
                .padding(.top, Spacing.sm)
            Spacer()
            VStack(spacing: Spacing.md) {
                Image(systemName: "fork.knife.circle")
                    .font(.system(size: 40))
                    .foregroundStyle(Color.appTextTertiary)
                Text("No saved meals yet.")
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTextSecondary)
                Button {
                    onCreateMeal()
                } label: {
                    Label("Create Meal", systemImage: "plus")
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .padding(.horizontal, Spacing.lg)
                        .padding(.vertical, Spacing.sm)
                        .background(Color.appTint)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Meal List

    private var mealList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                tabPageHeader("Meals")

                VStack(spacing: 0) {
                    ForEach(Array(mealsStore.meals.enumerated()), id: \.element.id) { idx, meal in
                        if idx > 0 { Divider().padding(.leading, Spacing.lg) }
                        SavedMealRow(meal: meal, onTap: {
                            if let pick = onPickMeal { pick(meal) }
                            else { logMealTarget = meal }
                        })
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    Task { try? await mealsStore.delete(id: meal.id) }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                    }
                }
                .background(Color.appSurface)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                .padding(.horizontal, Spacing.lg)
                .padding(.top, Spacing.sm)
            }
            .padding(.top, Spacing.sm)
        }
    }

    private func tabPageHeader(_ title: String) -> some View {
        Text(title)
            .font(.appLargeTitle)
            .tracking(Typography.Tracking.largeTitle)
            .foregroundStyle(Color.appText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.xs)
    }
}

// MARK: - SavedMealRow

@MainActor
struct SavedMealRow: View {
    let meal:  SavedMeal
    let onTap: () -> Void

    @State private var isExpanded = false

    private var total: Macros { meal.totalMacros }

    var body: some View {
        VStack(spacing: 0) {
            // Main row
            HStack(spacing: Spacing.md) {
                // Chevron + name — tap toggles dropdown
                Button {
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.75)) {
                        isExpanded.toggle()
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                            Text(meal.name)
                                .font(.appBody)
                                .fontWeight(.medium)
                                .foregroundStyle(Color.appText)
                                .lineLimit(1)
                                .layoutPriority(1)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(Color.appTextTertiary)
                                .rotationEffect(.degrees(isExpanded ? 90 : 0))
                                .animation(.spring(response: 0.25, dampingFraction: 0.75), value: isExpanded)
                        }
                        Text("\(meal.items.count) item\(meal.items.count == 1 ? "" : "s")")
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextTertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                Spacer()

                MacroNutrientsColumn(macros: total)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.md)
            .contentShape(Rectangle())
            .onTapGesture {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                onTap()
            }

            // Expanded item list
            if isExpanded {
                ForEach(meal.items) { item in
                    Divider().padding(.leading, Spacing.lg)
                    HStack(spacing: Spacing.md) {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                                Text(item.name)
                                    .font(.appBody)
                                    .fontWeight(.medium)
                                    .foregroundStyle(Color.appText)
                                    .lineLimit(1)
                                    .layoutPriority(1)
                                Text("·")
                                    .font(.appCaption1)
                                    .foregroundStyle(Color.appTextTertiary)
                                Text("\(formatQuantity(item.quantity, unit: item.unit)) \(item.unit)")
                                    .font(.appCaption1)
                                    .foregroundStyle(Color.appTextTertiary)
                                    .lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        MacroNutrientsColumn(macros: Macros(
                            calories: item.calories,
                            proteinG: item.proteinG,
                            carbsG:   item.carbsG,
                            fatG:     item.fatG))
                    }
                    .padding(.horizontal, Spacing.xxxl)
                    .padding(.vertical, Spacing.sm)
                }
            }
        }
    }

}
