import SwiftUI
import UIKit

// MARK: - Bottom bar height (material strip only, for overlay positioning)

private struct FoodSearchBottomBarHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

// MARK: - FoodSearchView

/// Full-screen food search presented as a fullScreenCover.
/// Three tabs: Search results, My Foods, Meals (stub).
@MainActor
struct FoodSearchView: View {
    /// Fallback before first layout pass measures the material bar.
    private enum Chrome {
        static let fallbackMaterialBarHeight: CGFloat = 100
        static let backButtonSize:        CGFloat = 44
    }

    @Environment(DailyLogStore.self) private var logStore
    @Environment(GoalStore.self)     private var goalStore
    @Environment(DateStore.self)     private var dateStore

    let onDismiss: () -> Void

    @State private var vm           = FoodSearchViewModel()
    @State private var selectedTab  = 0
    @State private var detailFood:  IdentifiedFood?      = nil
    @State private var showBarcode: Bool                 = false
    @State private var createFoodMode: CreateFoodMode?   = nil
    @State private var barcodeError: String?             = nil
    @State private var showBarcodeError: Bool            = false

    @FocusState private var searchFocused: Bool

    /// Height of the bottom safe-area inset content (search + tabs + material only).
    @State private var bottomBarMaterialHeight: CGFloat = 0

    /// Scroll padding: material bar + gap above it for the floating back control + buffer.
    private var scrollBottomInset: CGFloat {
        let bar = max(bottomBarMaterialHeight, Chrome.fallbackMaterialBarHeight)
        return bar + Chrome.backButtonSize + Spacing.sm + Spacing.lg
    }

    var body: some View {
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
            bottomChrome
        }
        // Back is NOT in the inset — avoids an opaque compositing layer behind the whole inset height.
        .overlay(alignment: .bottomLeading) {
            backButton
                .padding(.leading, Spacing.lg)
                .padding(.bottom, max(bottomBarMaterialHeight, Chrome.fallbackMaterialBarHeight) + Spacing.sm)
        }
        .onPreferenceChange(FoodSearchBottomBarHeightKey.self) { bottomBarMaterialHeight = $0 }
        .onChange(of: vm.query) { _, _ in vm.onQueryChanged() }
        .task {
            await vm.fetchFrequentAndRecent()
            await vm.fetchMyFoods()
        }
        .sheet(item: $detailFood) { identified in
            FoodDetailSheet(
                identifiedFood: identified,
                onDismiss: {
                    detailFood = nil
                    Task { await vm.fetchFrequentAndRecent() }
                },
                onEditCustom: { food in
                    detailFood = nil
                    createFoodMode = .editCustom(food)
                },
                onPublishCustom: { food in
                    detailFood = nil
                    createFoodMode = .publishFromCustom(food)
                })
            .environment(logStore)
            .environment(goalStore)
            .environment(dateStore)
        }
        .sheet(item: $createFoodMode) { mode in
            CreateFoodSheet(
                mode: mode,
                onSaved: { _ in
                    Task {
                        await vm.fetchMyFoods()
                        await vm.fetchFrequentAndRecent()
                    }
                },
                onDismiss: { createFoodMode = nil })
        }
        .fullScreenCover(isPresented: $showBarcode) {
            BarcodeScannerScreen(
                onScanned: { raw in
                    showBarcode = false
                    Task { await handleBarcodeResult(raw) }
                },
                onDismiss: { showBarcode = false })
        }
        .alert("Barcode Not Found", isPresented: $showBarcodeError) {
            Button("Create Food") {
                createFoodMode = .new(prefillName: nil, prefillBarcode: barcodeError)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("No food matched this barcode. Would you like to create it?")
        }
    }

    // MARK: - Bottom chrome (material bar only — back is overlaid, not in safeAreaInset)

    private var backButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onDismiss()
        } label: {
            Image(systemName: "chevron.left")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.appTint)
                .frame(width: Chrome.backButtonSize, height: Chrome.backButtonSize)
                .contentShape(Circle())
                .glassEffect(.regular.interactive(), in: Circle())
        }
        .buttonStyle(.plain)
    }

    private var bottomChrome: some View {
        VStack(spacing: Spacing.sm) {
            HStack(spacing: Spacing.sm) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15))
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
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, 10)
            .background(Color.appSurfaceSecondary)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.xl, style: .continuous))
            .padding(.horizontal, Spacing.md)

            HStack(spacing: Spacing.md) {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    showBarcode = true
                } label: {
                    Image(systemName: "barcode.viewfinder")
                        .font(.system(size: 19))
                        .foregroundStyle(Color.appTint)
                        .frame(width: 36, height: 36)
                        .glassEffect(.regular.interactive(), in: Circle())
                }
                .buttonStyle(.plain)

                Picker("", selection: $selectedTab) {
                    Text("Search").tag(0)
                    Text("My Foods").tag(1)
                    Text("Meals").tag(2)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: .infinity)

                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    createFoodMode = .new(prefillName: nil, prefillBarcode: nil)
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(Color.appTint)
                        .frame(width: 36, height: 36)
                        .glassEffect(.regular.interactive(), in: Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Spacing.md)
        }
        .padding(.top, Spacing.sm)
        .padding(.bottom, Spacing.xs)
        .frame(maxWidth: .infinity)
        .background {
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea(edges: .bottom)
        }
        .background {
            GeometryReader { g in
                Color.clear.preference(key: FoodSearchBottomBarHeightKey.self, value: g.size.height)
            }
        }
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
                                showQuickAdd: true,
                                onTap:        { detailFood = IdentifiedFood(food: anyFood(from: food)) },
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
                                showQuickAdd: true,
                                onTap:        { detailFood = IdentifiedFood(food: anyFood(from: food)) },
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
        .contentMargins(.bottom, scrollBottomInset, for: .scrollContent)
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
                                onTap:        { detailFood = IdentifiedFood(food: anyF) },
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
                                onTap:        { detailFood = IdentifiedFood(food: anyF) },
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
                                onTap:        { detailFood = IdentifiedFood(food: anyF) },
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
                            createFoodMode = .new(
                                prefillName:    vm.query,
                                prefillBarcode: nil)
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
        .contentMargins(.bottom, scrollBottomInset, for: .scrollContent)
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
                            createFoodMode = .new(prefillName: nil, prefillBarcode: nil)
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
                                    onTap:        { detailFood = IdentifiedFood(food: anyF) },
                                    onQuickAdd:   nil)
                            }
                        }
                        .background(Color.appSurface)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                        .padding(Spacing.lg)
                    }
                    .padding(.top, Spacing.sm)
                }
                .contentMargins(.bottom, scrollBottomInset, for: .scrollContent)
            }
        }
    }

    // MARK: - Meals Tab (stub)

    private var mealsTab: some View {
        VStack(spacing: 0) {
            tabPageHeader("Meals")
                .padding(.top, Spacing.sm)
            Spacer()
            VStack(spacing: Spacing.md) {
                Image(systemName: "fork.knife.circle")
                    .font(.system(size: 40))
                    .foregroundStyle(Color.appTextTertiary)
                Text("Saved meals coming soon.")
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTextSecondary)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Barcode Handler

    private func handleBarcodeResult(_ raw: String) async {
        do {
            let result = try await APIClient.shared.lookupBarcode(code: raw)
            switch result {
            case .community(let food):
                detailFood = IdentifiedFood(food: .community(food))
            case .custom(let food):
                detailFood = IdentifiedFood(food: .custom(food))
            case .notFound:
                barcodeError  = raw
                showBarcodeError = true
            }
        } catch {
            barcodeError     = raw
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
