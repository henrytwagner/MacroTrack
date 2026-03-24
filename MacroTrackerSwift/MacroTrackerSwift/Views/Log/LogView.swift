import SwiftUI
import UIKit

// MARK: - Constants

private let mealOrder: [MealLabel] = [.breakfast, .lunch, .dinner, .snack]

// MARK: - LogView

/// Main Log tab screen. Port of mobile/app/(tabs)/log.tsx.
@MainActor
struct LogView: View {
    @Environment(DateStore.self)     private var dateStore
    @Environment(DailyLogStore.self) private var dailyLogStore
    @Environment(GoalStore.self)     private var goalStore

    @State private var deletedEntry:         FoodEntry? = nil
    @State private var editingEntry:         FoodEntry? = nil
    @State private var showAddFood:          Bool       = false
    @State private var scrollY:              CGFloat    = 0
    @State private var showMacroPill:        Bool       = false
    @State private var macroPreviewExpanded: Bool       = false

    // MARK: - Body

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                LogDateHeader()

                ZStack(alignment: .top) {
                    centerPage
                        .frame(maxWidth: .infinity, maxHeight: .infinity)

                    if showMacroPill, let goals = currentGoals {
                        macroOverlayPill(goals: goals)
                            .padding(.top, Spacing.sm)
                            .padding(.horizontal, Spacing.md)
                            .transition(.move(edge: .top).combined(with: .opacity))
                            .zIndex(1)
                    }
                }
            }
            .background(Color.appBackground)
            // Horizontal swipe on the whole screen for day navigation.
            // simultaneousGesture lets the inner ScrollView still scroll vertically.
            .simultaneousGesture(
                DragGesture(minimumDistance: 40)
                    .onEnded { v in
                        let h = abs(v.translation.width)
                        let vert = abs(v.translation.height)
                        guard h > vert * 1.5, h > 60 else { return }
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        if v.translation.width < 0 { dateStore.goToNextDay() }
                        else { dateStore.goToPreviousDay() }
                    }
            )
            .overlay(alignment: .bottomTrailing) {
                fabStack
                    .padding(.trailing, Spacing.xxl)
                    .padding(.bottom, Spacing.xxl)
            }
            .overlay(alignment: .bottom) {
                UndoSnackbar(
                    message: deletedEntry.map { "\($0.name) deleted" } ?? "",
                    visible: deletedEntry != nil,
                    onUndo: handleUndo,
                    onDismiss: handleSnackbarDismiss
                )
            }
        }
        .fullScreenCover(isPresented: $showAddFood) {
            FoodSearchView(onDismiss: { showAddFood = false })
                .environment(dailyLogStore)
                .environment(goalStore)
                .environment(dateStore)
        }
        .sheet(item: $editingEntry) { entry in
            EditEntrySheet(entry: entry, onDismiss: { editingEntry = nil })
                .environment(dailyLogStore)
        }
        .task(id: dateStore.selectedDate) {
            await dailyLogStore.fetch(date: dateStore.selectedDate)
            await goalStore.fetch(date: dateStore.selectedDate)
        }
        .onChange(of: dateStore.selectedDate) { _, _ in
            scrollY = 0
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showMacroPill = false
                macroPreviewExpanded = false
            }
        }
    }

    // MARK: - Helpers

    private var currentGoals: DailyGoal? {
        guard let wrapped = goalStore.goalsByDate[dateStore.selectedDate] else { return nil }
        return wrapped
    }

    // MARK: - Center Page

    private var centerPage: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                macroCard
                    .padding(.horizontal, Spacing.lg)
                    .padding(.top, Spacing.md)

                if dailyLogStore.isLoading {
                    ProgressView()
                        .padding(.top, Spacing.xxl)

                } else if dailyLogStore.error != nil {
                    Text("Unable to connect to server. Check your connection.")
                        .font(.appSubhead)
                        .foregroundStyle(Color.appDestructive)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, Spacing.lg)
                        .padding(.top, Spacing.lg)

                } else if dailyLogStore.entries.isEmpty {
                    VStack(spacing: Spacing.md) {
                        Image(systemName: "book")
                            .font(.system(size: 40))
                            .foregroundStyle(Color.appTextTertiary)
                        Text("No entries yet. Tap + to log food.")
                            .font(.appSubhead)
                            .foregroundStyle(Color.appTextSecondary)
                    }
                    .padding(.top, Spacing.xxxl)

                } else {
                    ForEach(mealOrder, id: \.self) { meal in
                        let entries = dailyLogStore.entriesByMeal[meal] ?? []
                        MealGroup(
                            meal:     meal,
                            entries:  entries,
                            onDelete: handleDelete,
                            onTap:    { entry in editingEntry = entry })
                            .padding(.horizontal, Spacing.lg)
                    }
                }

                Spacer(minLength: 120)
            }
        }
        .onScrollGeometryChange(for: CGFloat.self) { geometry in
            geometry.contentOffset.y
        } action: { _, y in
            scrollY = y
            let shouldShow = y > 56 && currentGoals != nil
            if shouldShow != showMacroPill {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showMacroPill = shouldShow
                    if !shouldShow { macroPreviewExpanded = false }
                }
            }
        }
        .refreshable {
            await dailyLogStore.fetch(date: dateStore.selectedDate)
            await goalStore.fetch(date: dateStore.selectedDate)
        }
    }

    // MARK: - Macro Card

    @ViewBuilder
    private var macroCard: some View {
        if let goals = currentGoals {
            VStack(spacing: Spacing.md) {
                MacroProgressBar(
                    label: "Calories", current: dailyLogStore.totals.calories, goal: goals.calories,
                    accentColor: .caloriesAccent, overflowColor: .caloriesOverflow, unit: " cal")
                MacroProgressBar(
                    label: "Protein", current: dailyLogStore.totals.proteinG, goal: goals.proteinG,
                    accentColor: .proteinAccent, overflowColor: .proteinOverflow, unit: "g")
                MacroProgressBar(
                    label: "Carbs", current: dailyLogStore.totals.carbsG, goal: goals.carbsG,
                    accentColor: .carbsAccent, overflowColor: .carbsOverflow, unit: "g")
                MacroProgressBar(
                    label: "Fat", current: dailyLogStore.totals.fatG, goal: goals.fatG,
                    accentColor: .fatAccent, overflowColor: .fatOverflow, unit: "g")
            }
            .padding(Spacing.lg)
            .background(Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
        } else {
            Text("No daily goals set. Go to Profile → Daily Goals to get started.")
                .font(.appSubhead)
                .foregroundStyle(Color.appTextSecondary)
                .multilineTextAlignment(.center)
                .padding(Spacing.lg)
                .frame(maxWidth: .infinity)
                .background(Color.appSurface)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
        }
    }

    // MARK: - Macro Overlay Pill

    @ViewBuilder
    private func macroOverlayPill(goals: DailyGoal) -> some View {
        let totals = dailyLogStore.totals
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                macroPreviewExpanded.toggle()
            }
        } label: {
            Group {
                if macroPreviewExpanded {
                    expandedPillContent(goals: goals, totals: totals)
                } else {
                    collapsedPillContent(goals: goals, totals: totals)
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.sm)
            .background(Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: macroPreviewExpanded ? 28 : BorderRadius.full))
            .overlay(
                RoundedRectangle(cornerRadius: macroPreviewExpanded ? 28 : BorderRadius.full)
                    .stroke(Color.appBorder, lineWidth: 0.5)
            )
            .shadow(
                color: .black.opacity(macroPreviewExpanded ? 0.15 : 0.08),
                radius: macroPreviewExpanded ? 12 : 4,
                x: 0, y: macroPreviewExpanded ? 6 : 2
            )
        }
        .buttonStyle(.plain)
    }

    /// Collapsed pill: 4 compact rings (Cal / P / C / F) with comfortable spacing.
    private func collapsedPillContent(goals: DailyGoal, totals: Macros) -> some View {
        HStack(spacing: Spacing.sm) {
            SingleMacroRing(
                label: "Cal",  current: totals.calories, goal: goals.calories,
                accentColor: .caloriesAccent, overflowColor: .caloriesOverflow, variant: .compact)
            SingleMacroRing(
                label: "Pro",  current: totals.proteinG, goal: goals.proteinG,
                accentColor: .proteinAccent,  overflowColor: .proteinOverflow,  variant: .compact)
            SingleMacroRing(
                label: "Carb", current: totals.carbsG,   goal: goals.carbsG,
                accentColor: .carbsAccent,    overflowColor: .carbsOverflow,    variant: .compact)
            SingleMacroRing(
                label: "Fat",  current: totals.fatG,     goal: goals.fatG,
                accentColor: .fatAccent,      overflowColor: .fatOverflow,      variant: .compact)
        }
    }

    @ViewBuilder
    private func expandedPillContent(goals: DailyGoal, totals: Macros) -> some View {
        HStack(spacing: Spacing.lg) {
            macroPillColumn(
                label: "Cal",  current: totals.calories, goal: goals.calories,
                accent: .caloriesAccent, overflow: .caloriesOverflow, unit: "")
            macroPillColumn(
                label: "Pro",  current: totals.proteinG, goal: goals.proteinG,
                accent: .proteinAccent,  overflow: .proteinOverflow,  unit: "g")
            macroPillColumn(
                label: "Carb", current: totals.carbsG,   goal: goals.carbsG,
                accent: .carbsAccent,    overflow: .carbsOverflow,    unit: "g")
            macroPillColumn(
                label: "Fat",  current: totals.fatG,     goal: goals.fatG,
                accent: .fatAccent,      overflow: .fatOverflow,      unit: "g")
        }
    }

    @ViewBuilder
    private func macroPillColumn(
        label: String, current: Double, goal: Double,
        accent: Color, overflow: Color, unit: String
    ) -> some View {
        let remaining = goal - current
        let remainText = remaining >= 0
            ? "\(Int(remaining.rounded()))\(unit) left"
            : "\(Int((-remaining).rounded()))\(unit) over"
        VStack(spacing: 0) {
            SingleMacroRing(
                label: label, current: current, goal: goal,
                accentColor: accent, overflowColor: overflow, variant: .compact)
            Spacer().frame(height: Spacing.xs)
            Text("\(Int(current.rounded()))/\(Int(goal.rounded()))")
                .font(.appCaption2)
                .foregroundStyle(Color.appTextSecondary)
                .lineLimit(1)
            Spacer().frame(height: Spacing.xs)
            Text(remainText)
                .font(.appCaption2)
                .foregroundStyle(remaining < 0 ? overflow : Color.appTextTertiary)
                .lineLimit(1)
        }
    }

    // MARK: - FAB Stack

    private var fabStack: some View {
        VStack(spacing: Spacing.md) {
            // Secondary FAB: always white circle with tint "+" icon
            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                showAddFood = true
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Color.appTint)
                    .frame(width: 44, height: 44)
                    .background(Color.white)
                    .clipShape(Circle())
                    .shadow(color: .black.opacity(0.15), radius: 6, x: 0, y: 3)
            }
            .buttonStyle(LogScaleButtonStyle())

            // Primary FAB: tint circle with white fork.knife
            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                // Phase E: Kitchen Mode
            } label: {
                Image(systemName: "fork.knife")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 60, height: 60)
                    .background(Color.appTint)
                    .clipShape(Circle())
                    .shadow(color: Color.appTint.opacity(0.4), radius: 8, x: 0, y: 4)
            }
            .buttonStyle(LogScaleButtonStyle())
        }
    }

    // MARK: - Delete / Undo Actions

    private func handleDelete(_ id: String) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        if let prev = deletedEntry {
            let prevId = prev.id
            Task { try? await dailyLogStore.commitDelete(id: prevId) }
        }
        deletedEntry = dailyLogStore.removeEntry(id: id)
    }

    private func handleUndo() {
        guard let entry = deletedEntry else { return }
        deletedEntry = nil
        dailyLogStore.restoreEntry(entry)
    }

    private func handleSnackbarDismiss() {
        guard let entry = deletedEntry else { return }
        let id = entry.id
        deletedEntry = nil
        Task { try? await dailyLogStore.commitDelete(id: id) }
    }
}

// MARK: - ScaleButtonStyle (FAB press effect)

private struct LogScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.8), value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview {
    LogView()
        .environment(DateStore.shared)
        .environment(DailyLogStore.shared)
        .environment(GoalStore.shared)
}
