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
    @Environment(SessionStore.self)  private var sessionStore

    @State private var deletedEntry:         FoodEntry? = nil
    @State private var editingEntry:         FoodEntry? = nil
    @State private var showAddFood:          Bool       = false
    @State private var showKitchenMode:      Bool       = false
    @State private var resumeSessionId:      String?    = nil
    @State private var scrollY:              CGFloat    = 0
    @State private var showMacroPill:        Bool       = false
    @State private var macroPreviewExpanded: Bool       = false

    @AppStorage("pillMacroStyleIndex") private var macroStyleIndex: Int = 0
    @State private var pillPressing: Bool = false

    // Multi-select state
    @State private var isSelectionMode:    Bool        = false
    @State private var selectedEntryIds:   Set<String> = []
    @State private var bulkDeletedEntries: [FoodEntry] = []

    // Save as Meal
    @State private var showSaveAsMeal:  Bool           = false
    @State private var saveAsMealItems: [SavedMealItem] = []

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
                if !isSelectionMode {
                    fabStack
                        .padding(.trailing, Spacing.xxl)
                        .padding(.bottom, Spacing.xxl)
                        .transition(.opacity.combined(with: .scale(scale: 0.9, anchor: .bottomTrailing)))
                }
            }
            .overlay(alignment: .bottom) {
                if isSelectionMode {
                    selectionToolbar
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .overlay(alignment: .bottom) {
                UndoSnackbar(
                    message:   snackbarMessage,
                    visible:   hasSnackbar,
                    onUndo:    deletedEntry != nil ? handleUndo : handleBulkUndo,
                    onDismiss: deletedEntry != nil ? handleSnackbarDismiss : handleBulkSnackbarDismiss
                )
            }
        }
        .fullScreenCover(isPresented: $showAddFood) {
            FoodSearchView(onDismiss: { showAddFood = false })
                .environment(dailyLogStore)
                .environment(goalStore)
                .environment(dateStore)
                .environment(MealsStore.shared)
        }
        .sheet(isPresented: $showSaveAsMeal) {
            MealCreationView(initialItems: saveAsMealItems)
                .environment(MealsStore.shared)
        }
        .fullScreenCover(isPresented: $showKitchenMode) {
            KitchenModeView(resumeSessionId: resumeSessionId, onDismiss: {
                showKitchenMode = false
                resumeSessionId = nil
            })
                .environment(dailyLogStore)
                .environment(goalStore)
                .environment(dateStore)
                .environment(DraftStore.shared)
        }
        .sheet(item: $editingEntry) { entry in
            FoodDetailSheet(entry: entry, onDismiss: { editingEntry = nil })
                .environment(dailyLogStore)
                .environment(goalStore)
                .environment(dateStore)
        }
        .task(id: dateStore.selectedDate) {
            await dailyLogStore.fetch(date: dateStore.selectedDate)
            await goalStore.fetch(date: dateStore.selectedDate)
            await sessionStore.fetch(date: dateStore.selectedDate)
        }
        .onChange(of: dateStore.selectedDate) { _, _ in
            isSelectionMode = false
            selectedEntryIds.removeAll()
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
                    // Entry IDs that belong to paused sessions — exclude from meal groups
                    let sessionEntryIds: Set<String> = {
                        var ids = Set<String>()
                        for s in sessionStore.pausedSessions {
                            for item in s.confirmedItems { ids.insert(item.id) }
                        }
                        return ids
                    }()

                    ForEach(mealOrder, id: \.self) { meal in
                        let entries = (dailyLogStore.entriesByMeal[meal] ?? [])
                            .filter { !sessionEntryIds.contains($0.id) }
                        MealGroup(
                            meal:            meal,
                            entries:         entries,
                            onDelete:        handleDelete,
                            onTap:           { entry in editingEntry = entry },
                            isSelectionMode: isSelectionMode,
                            selectedIds:     selectedEntryIds,
                            onSelect:        handleSelect
                        )
                        .padding(.horizontal, Spacing.lg)
                    }

                    // Paused Kitchen Mode sessions
                    ForEach(sessionStore.pausedSessions) { session in
                        SessionGroupCard(
                            session: session,
                            onResume: {
                                resumeSessionId = session.id
                                showKitchenMode = true
                            },
                            onDelete: {
                                Task {
                                    await sessionStore.deleteSession(id: session.id, date: dateStore.selectedDate)
                                    await dailyLogStore.fetch(date: dateStore.selectedDate)
                                }
                            }
                        )
                        .padding(.horizontal, Spacing.lg)
                    }
                }

                Spacer(minLength: 120)
            }
        }
        .onScrollOffsetChange { y in
            scrollY = y
            let shouldShow = y > 56 && currentGoals != nil
            if shouldShow != showMacroPill {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showMacroPill = shouldShow
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
            LogMacroCard(totals: dailyLogStore.totals, goals: goals)
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
        let radius: CGFloat = 20

        // ZStack lets both branches coexist during the crossfade while the pill resizes.
        ZStack {
            if macroPreviewExpanded {
                MacroPillContent(totals: totals, goals: goals, styleIndex: macroStyleIndex, isIcon: true)
                    .transition(.asymmetric(
                        insertion: .opacity.combined(with: .scale(scale: 0.88)),
                        removal:   .opacity.combined(with: .scale(scale: 0.88))
                    ))
            } else {
                MacroPillContent(totals: totals, goals: goals, styleIndex: macroStyleIndex, isIcon: false)
                    .transition(.asymmetric(
                        insertion: .opacity.combined(with: .scale(scale: 0.88)),
                        removal:   .opacity.combined(with: .scale(scale: 0.88))
                    ))
            }
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.sm)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: radius))
        .overlay(
            RoundedRectangle(cornerRadius: radius)
                .stroke(Color.appBorder, lineWidth: 0.5)
        )
        .shadow(
            color: .black.opacity(macroPreviewExpanded ? 0.08 : 0.12),
            radius: macroPreviewExpanded ? 4 : 8,
            x: 0, y: macroPreviewExpanded ? 2 : 4
        )
        .scaleEffect(pillPressing ? 0.97 : 1.0, anchor: .center)
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: pillPressing)
        .contentShape(RoundedRectangle(cornerRadius: radius))
        // Tap: toggle between detailed and icon view
        .onTapGesture {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                macroPreviewExpanded.toggle()
            }
        }
        // Long press: cycle style (0 → 1 → 2 → 0), independent of card styles
        .onLongPressGesture(minimumDuration: 0.45, pressing: { isPressing in
            withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) { pillPressing = isPressing }
        }) {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                pillPressing   = false
                macroStyleIndex = (macroStyleIndex + 1) % 3
            }
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

            // Primary FAB: tint circle with white fork.knife (always new session)
            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                resumeSessionId = nil
                showKitchenMode = true
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

    // MARK: - Selection Toolbar

    private var selectionToolbar: some View {
        HStack {
            Text(selectedEntryIds.isEmpty ? "Select items" : "\(selectedEntryIds.count) selected")
                .font(.appSubhead)
                .foregroundStyle(Color.appText)

            Spacer()

            // Save as Meal
            Button {
                handleSaveAsMeal()
            } label: {
                Image(systemName: "fork.knife.circle")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(selectedEntryIds.isEmpty ? Color.appTextTertiary : Color.appTint)
            }
            .disabled(selectedEntryIds.isEmpty)

            // Delete
            Button {
                handleBulkDelete()
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(selectedEntryIds.isEmpty ? Color.appTextTertiary : Color.appDestructive)
            }
            .disabled(selectedEntryIds.isEmpty)
            .padding(.leading, Spacing.md)

            Button("Cancel") {
                exitSelectionMode()
            }
            .font(.appSubhead)
            .foregroundStyle(Color.appTint)
            .padding(.leading, Spacing.md)
        }
        .padding(.horizontal, Spacing.xl)
        .padding(.top, Spacing.md)
        .padding(.bottom, Spacing.lg)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Divider() }
    }

    // MARK: - Snackbar Helpers

    private var snackbarMessage: String {
        if let e = deletedEntry { return "\(e.name) deleted" }
        let n = bulkDeletedEntries.count
        if n == 1 { return "\(bulkDeletedEntries[0].name) deleted" }
        return "\(n) entries deleted"
    }

    private var hasSnackbar: Bool {
        deletedEntry != nil || !bulkDeletedEntries.isEmpty
    }

    // MARK: - Selection Actions

    private func handleSelect(_ id: String) {
        withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
            if !isSelectionMode { isSelectionMode = true }
            if selectedEntryIds.contains(id) {
                selectedEntryIds.remove(id)
                if selectedEntryIds.isEmpty { exitSelectionMode() }
            } else {
                selectedEntryIds.insert(id)
            }
        }
    }

    private func exitSelectionMode() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            isSelectionMode = false
            selectedEntryIds.removeAll()
        }
    }

    private func handleSaveAsMeal() {
        let selected = dailyLogStore.entries.filter { selectedEntryIds.contains($0.id) }
        saveAsMealItems = selected.map { entry in
            SavedMealItem(
                id:              UUID().uuidString,
                name:            entry.name,
                quantity:        entry.quantity,
                unit:            entry.unit,
                calories:        entry.calories,
                proteinG:        entry.proteinG,
                carbsG:          entry.carbsG,
                fatG:            entry.fatG,
                source:          entry.source,
                usdaFdcId:       entry.usdaFdcId,
                customFoodId:    entry.customFoodId,
                communityFoodId: entry.communityFoodId)
        }
        exitSelectionMode()
        showSaveAsMeal = true
    }

    // MARK: - Bulk Delete / Undo

    private func handleBulkDelete() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        // Flush any pending single-entry undo first
        if let prev = deletedEntry {
            let id = prev.id
            deletedEntry = nil
            Task { try? await dailyLogStore.commitDelete(id: id) }
        }
        bulkDeletedEntries = dailyLogStore.removeEntries(ids: selectedEntryIds)
        exitSelectionMode()
    }

    private func handleBulkUndo() {
        guard !bulkDeletedEntries.isEmpty else { return }
        dailyLogStore.restoreEntries(bulkDeletedEntries)
        bulkDeletedEntries = []
    }

    private func handleBulkSnackbarDismiss() {
        guard !bulkDeletedEntries.isEmpty else { return }
        let entries = bulkDeletedEntries
        bulkDeletedEntries = []
        Task {
            await withThrowingTaskGroup(of: Void.self) { group in
                for entry in entries {
                    group.addTask { try await dailyLogStore.commitDelete(id: entry.id) }
                }
                try? await group.waitForAll()
            }
        }
    }

    // MARK: - Single Delete / Undo

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

// MARK: - Scroll Offset Helper

private extension View {
    /// Tracks scroll content offset Y. Uses `onScrollGeometryChange` on iOS 18+; no-op on iOS 17.
    @ViewBuilder
    func onScrollOffsetChange(action: @escaping (CGFloat) -> Void) -> some View {
        if #available(iOS 18, *) {
            self.onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y } action: { _, y in
                action(y)
            }
        } else {
            self
        }
    }
}

// MARK: - Preview

#Preview {
    LogView()
        .environment(DateStore.shared)
        .environment(DailyLogStore.shared)
        .environment(GoalStore.shared)
}
