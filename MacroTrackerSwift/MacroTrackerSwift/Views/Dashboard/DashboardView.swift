import SwiftUI

// MARK: - DashboardView

struct DashboardView: View {
    @Environment(DailyLogStore.self)      private var logStore
    @Environment(GoalStore.self)          private var goalStore
    @Environment(DashboardLayoutStore.self) private var layoutStore
    @Environment(DateStore.self)          private var dateStore
    @Environment(TabRouter.self)          private var tabRouter

    @State private var refreshing:      Bool = false
    @State private var lastAddedEntry:  FoodEntry? = nil
    @State private var showAddFood:     Bool = false
    @State private var showEditDashStub: Bool = false

    private var today: String { todayString() }

    // MARK: Body

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(spacing: Spacing.xl) {
                    greetingSection
                    progressCard
                    if !logStore.frequentFoods.isEmpty {
                        quickAddSection
                    }
                    todayLogSection
                    editDashLink
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.top, Spacing.sm)
                .padding(.bottom, 100)
            }
            .refreshable {
                await performRefresh()
            }
            .background(Color.appBackground)

            // Undo snackbar overlay
            UndoSnackbar(
                message:   lastAddedEntry.map { "Added \($0.name)." } ?? "",
                visible:   lastAddedEntry != nil,
                onUndo:    handleUndo,
                onDismiss: { lastAddedEntry = nil })
        }
        .task {
            await fetchAll()
        }
        .fullScreenCover(isPresented: $showAddFood) {
            FoodSearchView(onDismiss: { showAddFood = false })
                .environment(logStore)
                .environment(goalStore)
                .environment(dateStore)
        }
        .sheet(isPresented: $showEditDashStub) {
            stubSheet("Edit Dashboard — coming soon")
        }
    }

    // MARK: Sections

    private var greetingSection: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(greeting)
                .font(.appLargeTitle)
                .tracking(Typography.Tracking.largeTitle)
                .foregroundStyle(Color.appText)
            Text(formattedDate)
                .font(.appSubhead)
                .tracking(Typography.Tracking.subhead)
                .foregroundStyle(Color.appTextSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, Spacing.sm)
        .padding(.bottom, Spacing.xs)
    }

    private var progressCard: some View {
        let goals = goalStore.goalsByDate[today] ?? nil
        return VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Today's Progress")
                .font(.appHeadline)
                .tracking(Typography.Tracking.headline)
                .foregroundStyle(Color.appText)

            if let goals {
                DashboardMacroSingleLayout(
                    layoutId: layoutStore.layoutId,
                    totals:   logStore.totals,
                    goals:    goals)
            } else {
                Button {
                    tabRouter.selectedTab = 2
                } label: {
                    Text("Set your daily goals to track progress →")
                        .font(.appSubhead)
                        .tracking(Typography.Tracking.subhead)
                        .foregroundStyle(Color.appTint)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.lg)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(Spacing.xl)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
    }

    private var quickAddSection: some View {
        VStack(spacing: Spacing.md) {
            HStack {
                Text("Quick Add")
                    .font(.appHeadline)
                    .tracking(Typography.Tracking.headline)
                    .foregroundStyle(Color.appText)
                Spacer()
                Button("Search foods") { showAddFood = true }
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTint)
                    .buttonStyle(.plain)
            }
            .padding(.horizontal, Spacing.xs)

            VStack(spacing: 0) {
                ForEach(Array(logStore.frequentFoods.enumerated()), id: \.offset) { i, food in
                    if i > 0 {
                        Divider()
                            .padding(.leading, Spacing.lg)
                    }
                    FrequentFoodRow(
                        food: food,
                        onPressName: { showAddFood = true },
                        onQuickAdd: handleQuickAdd)
                }
            }
            .background(Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        }
    }

    private var todayLogSection: some View {
        VStack(spacing: Spacing.md) {
            HStack {
                Text("Today's Log")
                    .font(.appHeadline)
                    .tracking(Typography.Tracking.headline)
                    .foregroundStyle(Color.appText)
                Spacer()
                Button("See all") { tabRouter.selectedTab = 1 }
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTint)
                    .buttonStyle(.plain)
            }
            .padding(.horizontal, Spacing.xs)

            if logStore.isLoading && !refreshing {
                ProgressView()
                    .tint(Color.appTint)
                    .padding(.top, Spacing.lg)
            } else if logStore.error != nil {
                errorCard
            } else {
                logEntriesCard
            }
        }
    }

    private var errorCard: some View {
        Text("Unable to connect. Pull to refresh.")
            .font(.appSubhead)
            .foregroundStyle(Color.appDestructive)
            .multilineTextAlignment(.center)
            .padding(Spacing.xl)
            .frame(maxWidth: .infinity)
            .background(Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
    }

    private var logEntriesCard: some View {
        let recentEntries = logStore.entries
            .sorted { $0.createdAt > $1.createdAt }
            .prefix(3)

        return Group {
            if logStore.entries.isEmpty {
                emptyLogCard
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(recentEntries.enumerated()), id: \.element.id) { i, entry in
                        if i > 0 {
                            Divider()
                                .padding(.leading, Spacing.lg)
                        }
                        entryRow(entry: entry)
                    }

                    if logStore.entries.count > 3 {
                        Button {
                            tabRouter.selectedTab = 1
                        } label: {
                            Text("+\(logStore.entries.count - 3) more entries")
                                .font(.appFootnote)
                                .foregroundStyle(Color.appTint)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, Spacing.md)
                        }
                        .buttonStyle(.plain)
                        .overlay(alignment: .top) {
                            Divider()
                        }
                    }
                }
                .background(Color.appSurface)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
            }
        }
    }

    private var emptyLogCard: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "fork.knife")
                .font(.system(size: 32))
                .foregroundStyle(Color.appTextTertiary)
            Text("Nothing logged yet today.")
                .font(.appSubhead)
                .foregroundStyle(Color.appTextSecondary)
                .multilineTextAlignment(.center)
            Button {
                showAddFood = true
            } label: {
                Label("Log Food", systemImage: "plus")
                    .font(.appSubhead)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.vertical, Spacing.sm)
                    .background(Color.appTint)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, Spacing.xs)
        }
        .padding(Spacing.xl)
        .frame(maxWidth: .infinity)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
    }

    @ViewBuilder
    private func entryRow(entry: FoodEntry) -> some View {
        HStack(spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.name)
                    .font(.appBody)
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                MacroInlineLine(
                    prefix: "\(formatted(entry.quantity)) \(entry.unit)",
                    macros: Macros(calories: entry.calories,
                                   proteinG: entry.proteinG,
                                   carbsG: entry.carbsG,
                                   fatG: entry.fatG))
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(entry.mealLabel.rawValue.capitalized)
                .font(.appCaption1)
                .tracking(Typography.Tracking.caption1)
                .foregroundStyle(Color.appTextTertiary)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
    }

    private var editDashLink: some View {
        Button("Edit dashboard") { showEditDashStub = true }
            .font(.appSubhead)
            .foregroundStyle(Color.appTint)
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity)
    }

    // MARK: Stub sheet

    @ViewBuilder
    private func stubSheet(_ label: String) -> some View {
        NavigationStack {
            Text(label)
                .font(.appBody)
                .foregroundStyle(Color.appTextSecondary)
                .navigationTitle(label)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showEditDashStub = false }
                    }
                }
        }
    }

    // MARK: Data fetching

    private func fetchAll() async {
        async let entries: Void  = logStore.fetch(date: today)
        async let goals: Void    = goalStore.fetch(date: today)
        async let frequent: Void = logStore.fetchFrequentFoods()
        _ = await (entries, goals, frequent)
    }

    private func performRefresh() async {
        refreshing = true
        await fetchAll()
        refreshing = false
    }

    // MARK: Actions

    private func handleQuickAdd(_ food: FrequentFood) async {
        do {
            let entry = try await logStore.createEntry(CreateFoodEntryRequest(
                date:            today,
                name:            food.name,
                calories:        food.macros.calories,
                proteinG:        food.macros.proteinG,
                carbsG:          food.macros.carbsG,
                fatG:            food.macros.fatG,
                quantity:        food.lastQuantity,
                unit:            food.lastUnit,
                source:          food.source,
                mealLabel:       currentMealLabel(),
                usdaFdcId:       food.usdaFdcId,
                customFoodId:    food.customFoodId,
                communityFoodId: food.communityFoodId))
            lastAddedEntry = entry
            await logStore.fetchFrequentFoods()
        } catch {
            // silent failure — undo won't appear
        }
    }

    private func handleUndo() {
        guard let entry = lastAddedEntry else { return }
        logStore.removeEntry(id: entry.id)
        Task { try? await logStore.commitDelete(id: entry.id) }
        lastAddedEntry = nil
        Task { await logStore.fetchFrequentFoods() }
    }

    // MARK: Helpers

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour >= 5 && hour < 12 { return "Good morning" }
        if hour >= 12 && hour < 17 { return "Good afternoon" }
        return "Good evening"
    }

    private var formattedDate: String {
        let fmt = DateFormatter()
        fmt.dateFormat = "EEEE, MMMM d"
        fmt.locale = Locale(identifier: "en_US")
        return fmt.string(from: Date())
    }

    private func currentMealLabel() -> MealLabel {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour >= 5 && hour < 11  { return .breakfast }
        if hour >= 11 && hour < 14 { return .lunch }
        if hour >= 14 && hour < 17 { return .snack }
        if hour >= 17 && hour < 22 { return .dinner }
        return .snack
    }

    private func formatted(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(v))
            : String(format: "%.1f", v)
    }
}

// MARK: - Preview

#Preview {
    DashboardView()
        .environment(DailyLogStore.shared)
        .environment(GoalStore.shared)
        .environment(DashboardLayoutStore.shared)
        .environment(DateStore.shared)
        .environment(TabRouter.shared)
}
