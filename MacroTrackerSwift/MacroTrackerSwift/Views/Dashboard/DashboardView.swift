import SwiftUI
import Charts

// MARK: - DashboardView

struct DashboardView: View {
    @Environment(DailyLogStore.self) private var logStore
    @Environment(GoalStore.self)     private var goalStore
    @Environment(DateStore.self)     private var dateStore
    @Environment(TabRouter.self)     private var tabRouter
    @Environment(MealsStore.self)    private var mealsStore
    @Environment(WeightStore.self)   private var weightStore
    @Environment(StatsStore.self)    private var statsStore
    @Environment(InsightsStore.self) private var insightsStore
    @Environment(CalendarStore.self) private var calendarStore
    @Environment(ProfileStore.self)  private var profileStore

    @State private var refreshing:      Bool = false
    @State private var lastAddedEntry:  FoodEntry? = nil
    @State private var showAddFood:     Bool = false
    @State private var showLogWeight:   Bool = false
    @State private var showExport:      Bool = false
    @State private var showLogMeal:     SavedMeal? = nil

    private var today: String { todayString() }

    // MARK: Body

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                ScrollView {
                    VStack(spacing: Spacing.xl) {
                        // Insight banner
                        if let insight = insightsStore.activeInsights.first {
                            InsightBannerView(insight: insight) {
                                insightsStore.dismiss(insight.id)
                            }
                        }

                        greetingSection
                        progressCard

                        if !logStore.frequentFoods.isEmpty {
                            quickAddSection
                        }

                        // Quick Log Meals
                        if !mealsStore.frequentMeals.isEmpty {
                            quickLogMealsSection
                        }

                        // Weight card
                        weightCard

                        // Stats summary
                        statsSummaryCard

                        todayLogSection
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
            .navigationTitle("")
            .navigationBarHidden(true)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showExport = true } label: {
                        Image(systemName: "square.and.arrow.up")
                            .foregroundStyle(Color.appTint)
                    }
                }
            }
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
        .sheet(isPresented: $showLogWeight) {
            LogWeightSheet()
                .environment(weightStore)
                .environment(profileStore)
        }
        .sheet(isPresented: $showExport) {
            ExportView()
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
                DashboardMacroCard(totals: logStore.totals, goals: goals)
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

    // MARK: Quick Log Meals

    private var quickLogMealsSection: some View {
        VStack(spacing: Spacing.md) {
            HStack {
                Text("Quick Log Meals")
                    .font(.appHeadline)
                    .tracking(Typography.Tracking.headline)
                    .foregroundStyle(Color.appText)
                Spacer()
            }
            .padding(.horizontal, Spacing.xs)

            VStack(spacing: 0) {
                ForEach(Array(mealsStore.frequentMeals.prefix(3).enumerated()), id: \.element.id) { i, meal in
                    if i > 0 {
                        Divider().padding(.leading, Spacing.lg)
                    }
                    QuickLogMealRow(
                        meal: meal,
                        onPressName: {
                            // Find the saved meal to show LogMealSheet
                            if let saved = mealsStore.meal(for: meal.savedMealId) {
                                showLogMeal = saved
                            }
                        },
                        onQuickLog: handleQuickLogMeal)
                }
            }
            .background(Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        }
    }

    // MARK: Weight Card

    private var weightCard: some View {
        NavigationLink(destination: WeightTrackingView()
            .environment(weightStore)
            .environment(profileStore)) {
            HStack {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text("Weight")
                        .font(.appHeadline)
                        .foregroundStyle(Color.appText)

                    if let weight = weightStore.latestWeight {
                        let isMetric = profileStore.profile?.preferredUnits != .imperial
                        let display = isMetric ? weight : weight * 2.20462
                        let unit = isMetric ? "kg" : "lbs"
                        Text("\(display, specifier: "%.1f") \(unit)")
                            .font(.appTitle3)
                            .foregroundStyle(Color.appText)
                            .monospacedDigit()
                    } else {
                        Text("No data")
                            .font(.appSubhead)
                            .foregroundStyle(Color.appTextTertiary)
                    }

                    if let rate = weightStore.weeklyRateKg {
                        let isMetric = profileStore.profile?.preferredUnits != .imperial
                        let display = isMetric ? rate : rate * 2.20462
                        let unit = isMetric ? "kg" : "lbs"
                        HStack(spacing: 4) {
                            Image(systemName: rate > 0 ? "arrow.up.right" : rate < 0 ? "arrow.down.right" : "arrow.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(rate > 0 ? Color.appWarning : Color.appSuccess)
                            Text("\(abs(display), specifier: "%.1f") \(unit)/wk")
                                .font(.appCaption1)
                                .foregroundStyle(Color.appTextSecondary)
                                .monospacedDigit()
                        }
                    }
                }

                Spacer()

                // Mini sparkline
                if weightStore.entries.count >= 2 {
                    Chart(weightStore.entries) { entry in
                        LineMark(
                            x: .value("Date", entry.date),
                            y: .value("Weight", entry.weightKg)
                        )
                        .foregroundStyle(Color.appTint.opacity(0.6))
                        .interpolationMethod(.catmullRom)
                    }
                    .chartXAxis(.hidden)
                    .chartYAxis(.hidden)
                    .frame(width: 80, height: 40)
                }

                Button {
                    showLogWeight = true
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(Color.appTint)
                }
                .buttonStyle(.plain)
            }
            .padding(Spacing.xl)
            .background(Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        }
        .buttonStyle(.plain)
    }

    // MARK: Stats Summary Card

    private var statsSummaryCard: some View {
        NavigationLink(destination: StatsView()
            .environment(statsStore)) {
            VStack(alignment: .leading, spacing: Spacing.md) {
                HStack {
                    Text("This Week")
                        .font(.appHeadline)
                        .foregroundStyle(Color.appText)
                    Spacer()
                    Text("View Stats")
                        .font(.appSubhead)
                        .foregroundStyle(Color.appTint)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.appTint)
                }

                HStack(spacing: Spacing.xl) {
                    VStack(spacing: Spacing.xs) {
                        Text("\(Int(statsStore.avgCalories))")
                            .font(.appTitle3)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.caloriesAccent)
                            .monospacedDigit()
                        Text("avg cal")
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextSecondary)
                    }

                    VStack(spacing: Spacing.xs) {
                        Text("\(Int(statsStore.consistencyScore))%")
                            .font(.appTitle3)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.appTint)
                            .monospacedDigit()
                        Text("logged")
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextSecondary)
                    }

                    VStack(spacing: Spacing.xs) {
                        Text("\(Int(statsStore.goalHitRate))%")
                            .font(.appTitle3)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.appSuccess)
                            .monospacedDigit()
                        Text("goals met")
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextSecondary)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .padding(Spacing.xl)
            .background(Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        }
        .buttonStyle(.plain)
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
                HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                    Text(entry.name)
                        .font(.appBody)
                        .fontWeight(.medium)
                        .foregroundStyle(Color.appText)
                        .lineLimit(1)
                        .layoutPriority(1)
                    Text("·")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextTertiary)
                    Text("\(formatQuantity(entry.quantity, unit: entry.unit)) \(entry.unit)")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextTertiary)
                        .lineLimit(1)
                }
                Text(entry.mealLabel.rawValue.capitalized)
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextTertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            MacroNutrientsColumn(
                macros: Macros(
                    calories: entry.calories,
                    proteinG: entry.proteinG,
                    carbsG:   entry.carbsG,
                    fatG:     entry.fatG),
                font: .appBody)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
    }

    // MARK: Data fetching

    private func fetchAll() async {
        async let entries: Void   = logStore.fetch(date: today)
        async let goals: Void     = goalStore.fetch(date: today)
        async let frequent: Void  = logStore.fetchFrequentFoods()
        async let meals: Void     = mealsStore.fetchFrequentMeals()
        async let stats: Void     = statsStore.fetch(range: .week)
        async let weight: Void    = weightStore.fetch(from: dateString(daysAgo: 90), to: today)
        async let calendar: Void  = calendarStore.fetchMonth(Date())
        _ = await (entries, goals, frequent, meals, stats, weight, calendar)

        // Compute insights from fetched summary data
        let allSummaries = Array(calendarStore.summaries.values)
        insightsStore.computeInsights(summaries: allSummaries)
    }

    private func performRefresh() async {
        refreshing = true
        calendarStore.invalidate()
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
            // silent failure
        }
    }

    private func handleQuickLogMeal(_ meal: FrequentMeal) async {
        do {
            let entries = try await mealsStore.logMeal(
                savedMealId: meal.savedMealId,
                date: today,
                mealLabel: currentMealLabel(),
                scaleFactor: 1.0)
            if let first = entries.first {
                lastAddedEntry = first
            }
            await logStore.fetch(date: today)
        } catch {
            // silent failure
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


    private func dateString(daysAgo: Int) -> String {
        let cal = Calendar.current
        let date = cal.date(byAdding: .day, value: -daysAgo, to: Date())!
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: date)
    }
}

// MARK: - Preview

#Preview {
    DashboardView()
        .environment(DailyLogStore.shared)
        .environment(GoalStore.shared)
        .environment(DateStore.shared)
        .environment(TabRouter.shared)
        .environment(MealsStore.shared)
        .environment(WeightStore.shared)
        .environment(StatsStore.shared)
        .environment(InsightsStore.shared)
        .environment(CalendarStore.shared)
        .environment(ProfileStore.shared)
}
