import SwiftUI
import UIKit

// MARK: - FoodSearchView

/// Full-screen food search presented as a fullScreenCover.
/// Three tabs: Search results, My Foods, Meals (stub).
@MainActor
struct FoodSearchView: View {
    private enum Chrome {
        static let backButtonSize: CGFloat = 44
    }

    /// Unified sheet state — only one sheet can present at a time.
    private enum ActiveSheet: Identifiable {
        case foodDetail(IdentifiedFood)
        case createFood(CreateFoodMode)

        var id: String {
            switch self {
            case .foodDetail(let f): return "detail-\(f.id)"
            case .createFood(let m): return "create-\(m.id)"
            }
        }
    }

    /// Unified fullScreenCover state.
    private enum ActiveCover: Identifiable {
        case barcode
        case mealCreation

        var id: String {
            switch self {
            case .barcode:      return "barcode"
            case .mealCreation: return "meal"
            }
        }
    }

    @Environment(DailyLogStore.self) private var logStore
    @Environment(GoalStore.self)     private var goalStore
    @Environment(DateStore.self)     private var dateStore

    let onDismiss: () -> Void
    /// When non-nil, the view is in ingredient-picker mode: FoodDetailSheet commits SavedMealItems
    /// instead of FoodEntries, and tapping a saved meal copies its items individually.
    var onAddIngredient: ((SavedMealItem) -> Void)? = nil
    /// When non-nil, tapping a food row calls this directly (skipping FoodDetailSheet).
    /// Used by Kitchen Mode to add items as unconfirmed draft cards.
    var onSelectFoodDirect: ((AnyFood) -> Void)? = nil

    @Environment(MealsStore.self) private var mealsStore

    private var isIngredientMode: Bool { onAddIngredient != nil }
    private var isDirectSelectMode: Bool { onSelectFoodDirect != nil }

    private func handleFoodTap(_ food: AnyFood) {
        if let direct = onSelectFoodDirect {
            direct(food)
        } else {
            activeSheet = .foodDetail(IdentifiedFood(food: food))
        }
    }

    @State private var vm              = FoodSearchViewModel()
    @State private var selectedTab     = 0
    @State private var activeSheet:    ActiveSheet?       = nil
    @State private var activeCover:    ActiveCover?       = nil
    @State private var barcodeError:   String?            = nil
    @State private var showBarcodeError: Bool             = false

    @FocusState private var searchFocused: Bool

    var body: some View {
        // Presentations must live on a plain host view, not on the UIPageViewController
        // that backs a page-style TabView — otherwise sheets/fullScreenCovers never appear.
        ZStack {
            TabView(selection: $selectedTab) {
                searchTab.tag(0)
                myFoodsTab.tag(1)
                mealsTab.tag(2)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            // UIPageViewController defaults to an opaque black backdrop; match app chrome instead.
            .background(Color.appBackground.ignoresSafeArea())
            .simultaneousGesture(
                DragGesture(minimumDistance: 40)
                    .onEnded { value in
                        guard selectedTab == 0 else { return }
                        guard value.translation.width > 80,
                              abs(value.translation.height) < value.translation.width * 0.6 else { return }
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        onDismiss()
                    }
            )
            .safeAreaInset(edge: .bottom, spacing: 0) {
                bottomNavRow
            }
            .onChange(of: vm.query) { _, _ in vm.onQueryChanged() }
            .task {
                await vm.fetchFrequentAndRecent()
                await vm.fetchMyFoods()
            }
        }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .foodDetail(let identified):
                FoodDetailSheet(
                    identifiedFood: identified,
                    onDismiss: {
                        activeSheet = nil
                        Task { await vm.fetchFrequentAndRecent() }
                    },
                    onEditCustom: { food in
                        activeSheet = .createFood(.editCustom(food))
                    },
                    onPublishCustom: { food in
                        activeSheet = .createFood(.publishFromCustom(food))
                    },
                    onAddToMeal: onAddIngredient)
                .environment(logStore)
                .environment(goalStore)
                .environment(dateStore)
            case .createFood(let mode):
                CreateFoodSheet(
                    mode: mode,
                    onSaved: { _ in
                        Task {
                            await vm.fetchMyFoods()
                            await vm.fetchFrequentAndRecent()
                        }
                    },
                    onDismiss: { activeSheet = nil })
            }
        }
        .fullScreenCover(item: $activeCover) { cover in
            switch cover {
            case .barcode:
                BarcodeScannerOverlay(
                    onScanned: { gtin in
                        activeCover = nil
                        Task { await handleBarcodeResult(gtin) }
                    },
                    onDismiss: { activeCover = nil })
            case .mealCreation:
                MealCreationView(initialItems: [])
                    .environment(mealsStore)
            }
        }
        .alert("Barcode Not Found", isPresented: $showBarcodeError) {
            Button("Create Food") {
                activeSheet = .createFood(.new(prefillName: nil, prefillBarcode: barcodeError))
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("No food matched this barcode. Would you like to create it?")
        }
    }

    // MARK: - Chrome

    /// Safari-style bottom chrome: segmented picker above, then [back] [search pill] [add] in one row.
    private var bottomNavRow: some View {
        VStack(spacing: Spacing.sm) {
            Picker("", selection: $selectedTab) {
                Text("Search").tag(0)
                Text("My Foods").tag(1)
                Text("Meals").tag(2)
            }
            .pickerStyle(.segmented)
            .controlSize(.small)
            .padding(.horizontal, Spacing.lg)

            HStack(spacing: Spacing.sm) {
                backButton

                // Expanding search pill — mirrors Safari's address bar
                HStack(spacing: Spacing.xs) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.appTextSecondary)
                    TextField("Search foods…", text: $vm.query)
                        .focused($searchFocused)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .submitLabel(.search)
                    if !vm.query.isEmpty {
                        Button {
                            vm.query = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(Color.appTextTertiary)
                        }
                        .buttonStyle(.plain)
                    }
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        activeCover = .barcode
                    } label: {
                        Image(systemName: "barcode.viewfinder")
                            .font(.system(size: 16))
                            .foregroundStyle(Color.appTint)
                            .padding(.horizontal, Spacing.xs)
                            .padding(.vertical, Spacing.xs)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .glassEffect(.regular.interactive(), in: Capsule())

                addButton
            }
            .padding(.horizontal, Spacing.lg)
        }
        .padding(.top, Spacing.sm)
        .padding(.bottom, Spacing.xs)
        .frame(maxWidth: .infinity)
        .background(.clear)
    }

    private var addButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            if selectedTab == 2 {
                activeCover = .mealCreation
            } else {
                activeSheet = .createFood(.new(prefillName: nil, prefillBarcode: nil))
            }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(Color.appTint)
                .frame(width: Chrome.backButtonSize, height: Chrome.backButtonSize)
                .contentShape(Circle())
                .glassEffect(.regular.interactive(), in: Circle())
        }
        .buttonStyle(.plain)
    }

    private var backButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onDismiss()
        } label: {
            if isIngredientMode {
                Text("Done")
                    .font(.appSubhead).fontWeight(.semibold)
                    .foregroundStyle(Color.appTint)
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, 10)
                    .glassEffect(.regular.interactive(), in: Capsule())
            } else {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.appTint)
                    .frame(width: Chrome.backButtonSize, height: Chrome.backButtonSize)
                    .contentShape(Circle())
                    .glassEffect(.regular.interactive(), in: Circle())
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Search Tab

    private var searchTab: some View {
        Group {
            if vm.query.trimmingCharacters(in: .whitespaces).isEmpty {
                emptyStateContent
            } else if vm.isSearching {
                VStack(alignment: .leading, spacing: 0) {
                    tabPageHeader("Search")
                        .padding(.top, Spacing.sm)
                    Spacer()
                    ProgressView()
                        .frame(maxWidth: .infinity)
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let results = vm.results {
                searchResultsList(results: results)
            } else {
                emptyStateContent
            }
        }
    }

    private var emptyStateContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                tabPageHeader("Search")

                if !vm.frequentFoods.isEmpty {
                    sectionHeader("Frequent")
                    VStack(spacing: 0) {
                        ForEach(Array(vm.frequentFoods.enumerated()), id: \.offset) { i, food in
                            if i > 0 { Divider().padding(.leading, Spacing.lg) }
                            FoodSearchResultRow(
                                food:         anyFood(from: food),
                                showQuickAdd: !isIngredientMode,
                                onTap:        { handleFoodTap(anyFood(from: food)) },
                                onQuickAdd:   { Task { await quickAdd(food: anyFood(from: food)) } })
                        }
                    }
                    .background(Color.appSurface)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                    .padding(.horizontal, Spacing.lg)
                }

                if !vm.recentFoods.isEmpty {
                    sectionHeader("Recent")
                    VStack(spacing: 0) {
                        ForEach(Array(vm.recentFoods.enumerated()), id: \.offset) { i, food in
                            if i > 0 { Divider().padding(.leading, Spacing.lg) }
                            FoodSearchResultRow(
                                food:         anyFood(from: food),
                                showQuickAdd: !isIngredientMode,
                                onTap:        { handleFoodTap(anyFood(from: food)) },
                                onQuickAdd:   { Task { await quickAdd(food: anyFood(from: food)) } })
                        }
                    }
                    .background(Color.appSurface)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                    .padding(.horizontal, Spacing.lg)
                }

                if vm.frequentFoods.isEmpty && vm.recentFoods.isEmpty {
                    VStack(spacing: Spacing.md) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 40))
                            .foregroundStyle(Color.appTextTertiary)
                        Text("Search for a food or tap + to create one.")
                            .font(.appSubhead)
                            .foregroundStyle(Color.appTextSecondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 80)
                    .frame(maxWidth: .infinity)
                }

            }
            .padding(.top, Spacing.sm)
        }
    }

    private func searchResultsList(results: UnifiedSearchResponse) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                tabPageHeader("Search")

                if !results.myFoods.isEmpty {
                    sectionHeader("MY FOODS")
                    VStack(spacing: 0) {
                        ForEach(Array(results.myFoods.enumerated()), id: \.element.id) { i, food in
                            if i > 0 { Divider().padding(.leading, Spacing.lg) }
                            let anyF = AnyFood.custom(food)
                            FoodSearchResultRow(
                                food:         anyF,
                                showQuickAdd: false,
                                onTap:        { handleFoodTap(anyF) },
                                onQuickAdd:   nil)
                        }
                    }
                    .background(Color.appSurface)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                    .padding(.horizontal, Spacing.lg)
                }

                if !results.community.isEmpty {
                    sectionHeader("COMMUNITY")
                    VStack(spacing: 0) {
                        ForEach(Array(results.community.enumerated()), id: \.element.id) { i, food in
                            if i > 0 { Divider().padding(.leading, Spacing.lg) }
                            let anyF = AnyFood.community(food)
                            FoodSearchResultRow(
                                food:         anyF,
                                showQuickAdd: false,
                                onTap:        { handleFoodTap(anyF) },
                                onQuickAdd:   nil)
                        }
                    }
                    .background(Color.appSurface)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                    .padding(.horizontal, Spacing.lg)
                }

                if !results.database.isEmpty {
                    sectionHeader("DATABASE")
                    VStack(spacing: 0) {
                        ForEach(Array(results.database.enumerated()), id: \.element.fdcId) { i, food in
                            if i > 0 { Divider().padding(.leading, Spacing.lg) }
                            let anyF = AnyFood.usda(food)
                            FoodSearchResultRow(
                                food:         anyF,
                                showQuickAdd: false,
                                onTap:        { handleFoodTap(anyF) },
                                onQuickAdd:   nil)
                        }
                    }
                    .background(Color.appSurface)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                    .padding(.horizontal, Spacing.lg)
                }

                if results.myFoods.isEmpty && results.community.isEmpty && results.database.isEmpty {
                    VStack(spacing: Spacing.md) {
                        Text("No results for \"\(vm.query)\"")
                            .font(.appSubhead)
                            .foregroundStyle(Color.appTextSecondary)
                        Button {
                            activeSheet = .createFood(.new(
                                prefillName:    vm.query,
                                prefillBarcode: nil))
                        } label: {
                            Label("Create \"\(vm.query)\"", systemImage: "plus")
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
                    .padding(.top, 60)
                    .frame(maxWidth: .infinity)
                }

            }
            .padding(.top, Spacing.sm)
        }
    }

    /// Matches food-management screens (`ManageCustomFoodsView`, etc.) that use
    /// `navigationBarTitleDisplayMode(.large)` — same scale and tracking as `.appLargeTitle`.
    private func tabPageHeader(_ title: String) -> some View {
        Text(title)
            .font(.appLargeTitle)
            .tracking(Typography.Tracking.largeTitle)
            .foregroundStyle(Color.appText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.xs)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.appCaption1)
            .fontWeight(.semibold)
            .foregroundStyle(Color.appTextSecondary)
            .padding(.horizontal, Spacing.lg)
    }

    // MARK: - My Foods Tab

    private var myFoodsTab: some View {
        Group {
            if vm.myFoods.isEmpty {
                VStack(spacing: 0) {
                    tabPageHeader("My Foods")
                        .padding(.top, Spacing.sm)
                    Spacer()
                    VStack(spacing: Spacing.md) {
                        Image(systemName: "person.crop.square")
                            .font(.system(size: 40))
                            .foregroundStyle(Color.appTextTertiary)
                        Text("No personal foods yet.")
                            .font(.appSubhead)
                            .foregroundStyle(Color.appTextSecondary)
                        Button {
                            activeSheet = .createFood(.new(prefillName: nil, prefillBarcode: nil))
                        } label: {
                            Label("Create Food", systemImage: "plus")
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
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        tabPageHeader("My Foods")
                        VStack(spacing: 0) {
                            ForEach(Array(vm.myFoods.enumerated()), id: \.element.id) { i, food in
                                if i > 0 { Divider().padding(.leading, Spacing.lg) }
                                let anyF = AnyFood.custom(food)
                                FoodSearchResultRow(
                                    food:         anyF,
                                    showQuickAdd: false,
                                    onTap:        { handleFoodTap(anyF) },
                                    onQuickAdd:   nil)
                            }
                        }
                        .background(Color.appSurface)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                        .padding(Spacing.lg)
                    }
                    .padding(.top, Spacing.sm)
                }
                    }
        }
    }

    // MARK: - Meals Tab

    private var mealsTab: some View {
        MealsListView(
            onCreateMeal: { activeCover = .mealCreation },
            onDismiss:         onDismiss,
            onPickMeal:        isIngredientMode
                ? { meal in meal.items.forEach { onAddIngredient?($0) } }
                : nil)
        .environment(mealsStore)
        .environment(logStore)
        .environment(dateStore)
    }

    // MARK: - Barcode Handler

    private func handleBarcodeResult(_ raw: String) async {
        let normalized = GTINNormalizer.normalizeToGTIN(raw)
        guard !normalized.isEmpty else { return }
        do {
            let result = try await APIClient.shared.lookupBarcode(code: normalized)
            switch result {
            case .community(let food):
                activeSheet = .foodDetail(IdentifiedFood(food: .community(food)))
            case .custom(let food):
                activeSheet = .foodDetail(IdentifiedFood(food: .custom(food)))
            case .notFound:
                barcodeError  = normalized
                showBarcodeError = true
            }
        } catch {
            barcodeError     = normalized
            showBarcodeError = true
        }
    }

    // MARK: - Quick Add (from frequent/recent)

    private func quickAdd(food: AnyFood) async {
        let req = CreateFoodEntryRequest(
            date:            dateStore.selectedDate,
            name:            food.displayName,
            calories:        food.baseMacros.calories,
            proteinG:        food.baseMacros.proteinG,
            carbsG:          food.baseMacros.carbsG,
            fatG:            food.baseMacros.fatG,
            quantity:        food.baseServingSize,
            unit:            food.baseServingUnit,
            source:          food.foodSource,
            mealLabel:       currentMealLabel(),
            usdaFdcId:       food.asUSDA?.fdcId,
            customFoodId:    food.asCustomFood?.id,
            communityFoodId: food.asCommunityFood?.id)
        _ = try? await logStore.createEntry(req)
        await vm.fetchFrequentAndRecent()
    }

    // MARK: - AnyFood Helpers

    /// Frequent/recent rows carry `source` + IDs from the log. Only `CUSTOM` entries should use a `CustomFood` stub;
    /// previously everything fell back to `.custom`, so USDA/community items always showed the "mine" badge.
    private func anyFood(from frequent: FrequentFood) -> AnyFood {
        switch frequent.source {
        case .custom:
            if let id = frequent.customFoodId,
               let food = vm.myFoods.first(where: { $0.id == id }) {
                return .custom(food)
            }
            let stub = CustomFood(
                id:          frequent.customFoodId ?? "",
                name:        frequent.name,
                brandName:   nil,
                servingSize: frequent.lastQuantity,
                servingUnit: frequent.lastUnit,
                calories:    frequent.macros.calories,
                proteinG:    frequent.macros.proteinG,
                carbsG:      frequent.macros.carbsG,
                fatG:        frequent.macros.fatG,
                sodiumMg:    nil, cholesterolMg: nil,
                fiberG:      nil, sugarG:        nil,
                saturatedFatG: nil, transFatG:   nil,
                barcode:     nil,
                createdAt:   "", updatedAt: "")
            return .custom(stub)
        case .community:
            return .community(Self.stubCommunityFood(
                name:              frequent.name,
                macros:            frequent.macros,
                servingSize:       frequent.lastQuantity,
                servingUnit:       frequent.lastUnit,
                communityFoodId:   frequent.communityFoodId,
                usdaFdcId:         frequent.usdaFdcId))
        case .database:
            return .usda(Self.stubUSDASearch(
                name:        frequent.name,
                macros:      frequent.macros,
                servingSize: frequent.lastQuantity,
                servingUnit: frequent.lastUnit,
                usdaFdcId:   frequent.usdaFdcId))
        }
    }

    private func anyFood(from recent: RecentFood) -> AnyFood {
        switch recent.source {
        case .custom:
            if let id = recent.customFoodId,
               let food = vm.myFoods.first(where: { $0.id == id }) {
                return .custom(food)
            }
            let stub = CustomFood(
                id:          recent.customFoodId ?? "",
                name:        recent.name,
                brandName:   nil,
                servingSize: recent.quantity,
                servingUnit: recent.unit,
                calories:    recent.macros.calories,
                proteinG:    recent.macros.proteinG,
                carbsG:      recent.macros.carbsG,
                fatG:        recent.macros.fatG,
                sodiumMg:    nil, cholesterolMg: nil,
                fiberG:      nil, sugarG:        nil,
                saturatedFatG: nil, transFatG:   nil,
                barcode:     nil,
                createdAt:   "", updatedAt: "")
            return .custom(stub)
        case .community:
            return .community(Self.stubCommunityFood(
                name:              recent.name,
                macros:            recent.macros,
                servingSize:       recent.quantity,
                servingUnit:       recent.unit,
                communityFoodId:   recent.communityFoodId,
                usdaFdcId:         recent.usdaFdcId))
        case .database:
            return .usda(Self.stubUSDASearch(
                name:        recent.name,
                macros:      recent.macros,
                servingSize: recent.quantity,
                servingUnit: recent.unit,
                usdaFdcId:   recent.usdaFdcId))
        }
    }

    private static func stubCommunityFood(
        name: String,
        macros: Macros,
        servingSize: Double,
        servingUnit: String,
        communityFoodId: String?,
        usdaFdcId: Int?
    ) -> CommunityFood {
        CommunityFood(
            id:                 communityFoodId ?? "",
            name:               name,
            brandName:          nil,
            description:      nil,
            defaultServingSize: servingSize,
            defaultServingUnit: servingUnit,
            calories:           macros.calories,
            proteinG:           macros.proteinG,
            carbsG:             macros.carbsG,
            fatG:               macros.fatG,
            sodiumMg:           nil,
            cholesterolMg:      nil,
            fiberG:             nil,
            sugarG:             nil,
            saturatedFatG:      nil,
            transFatG:          nil,
            usdaFdcId:          usdaFdcId,
            createdByUserId:    nil,
            status:             .active,
            usesCount:          0,
            reportsCount:       0,
            trustScore:         0,
            lastUsedAt:         nil,
            createdAt:          "",
            updatedAt:          "")
    }

    private static func stubUSDASearch(
        name: String,
        macros: Macros,
        servingSize: Double,
        servingUnit: String,
        usdaFdcId: Int?
    ) -> USDASearchResult {
        USDASearchResult(
            fdcId:           usdaFdcId ?? 0,
            description:     name,
            brandName:       nil,
            servingSize:     servingSize,
            servingSizeUnit: servingUnit,
            macros:          macros,
            usesCount:       nil)
    }
}

// MARK: - CreateFoodMode: Identifiable for .sheet(item:)

extension CreateFoodMode: Identifiable {
    var id: String {
        switch self {
        case .new(let name, let barcode): return "new-\(name ?? "")-\(barcode ?? "")"
        case .editCustom(let f):          return "editCustom-\(f.id)"
        case .editCommunity(let f):       return "editCommunity-\(f.id)"
        case .publishFromCustom(let f):   return "publish-\(f.id)"
        }
    }
}
