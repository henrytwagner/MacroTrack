import SwiftUI

// MARK: - FoodInfoPage

/// Comprehensive "about this food" sheet — nutrition label, unit conversions,
/// metadata, and food-level actions (edit, publish, delete, report).
/// Distinct from FoodDetailSheet which handles quantity entry / logging.
@MainActor
struct FoodInfoPage: View {

    let food: AnyFood
    let onDismiss: () -> Void
    var onEditCustom: ((CustomFood) -> Void)?
    var onPublishCustom: ((CustomFood) -> Void)?
    var onFoodDeleted: (() -> Void)?

    @State private var vm: FoodInfoViewModel
    @State private var showQuantityEntry: IdentifiedFood?
    @State private var showDeleteConfirm = false
    @State private var showReportSheet = false
    @State private var reportReason = ""
    @State private var showNutritionDetails = false

    @Environment(DailyLogStore.self) private var logStore
    @Environment(GoalStore.self)     private var goalStore
    @Environment(DateStore.self)     private var dateStore

    init(food: AnyFood,
         onDismiss: @escaping () -> Void,
         onEditCustom: ((CustomFood) -> Void)? = nil,
         onPublishCustom: ((CustomFood) -> Void)? = nil,
         onFoodDeleted: (() -> Void)? = nil) {
        self.food = food
        self.onDismiss = onDismiss
        self.onEditCustom = onEditCustom
        self.onPublishCustom = onPublishCustom
        self.onFoodDeleted = onFoodDeleted
        _vm = State(initialValue: FoodInfoViewModel(food: food))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: Spacing.lg) {
                        headerSection
                        macroDashboardSection
                        nutritionDetailsSection
                        conversionsSection
                        metadataSection
                        actionsSection
                        Spacer(minLength: 40)
                    }
                    .padding(.top, Spacing.md)
                }
                .scrollDismissesKeyboard(.interactively)

                // Unit conversion overlay
                if vm.overlayPanel != .idle {
                    FoodUnitConversionOverlay(
                        overlayPanel:       $vm.overlayPanel,
                        conversions:        vm.mergedConversions,
                        onAdd:              { unitName, qibs in
                            try await vm.addConversion(unitName: unitName, quantityInBaseServings: qibs)
                        },
                        onDelete:           { convId in
                            try await vm.deleteConversion(id: convId)
                        },
                        pendingConversions: .constant([]),
                        isDraftMode:        false,
                        baseServingSize:    food.baseServingSize,
                        baseServingUnit:    food.baseServingUnit,
                        accentColor:        sourceAccent,
                        systemConversionIds: vm.systemConversionIds)
                        .zIndex(10)
                }
            }
            .navigationTitle("Food Info")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { onDismiss() }
                }
            }
            .task { await vm.loadConversions() }
            .sheet(item: $showQuantityEntry) { identified in
                FoodDetailSheet(
                    identifiedFood: identified,
                    onDismiss: { showQuantityEntry = nil })
            }
            .alert("Delete Food", isPresented: $showDeleteConfirm) {
                Button("Delete", role: .destructive) {
                    Task {
                        try? await vm.deleteFood()
                        onFoodDeleted?()
                        onDismiss()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will permanently delete this custom food. Any logged entries using it will keep their data.")
            }
            .alert("Report Food", isPresented: $showReportSheet) {
                TextField("Reason (optional)", text: $reportReason)
                Button("Report", role: .destructive) {
                    Task {
                        if case .community(let f) = food {
                            try? await APIClient.shared.reportCommunityFood(
                                id: f.id, reason: reportReason.isEmpty ? "Inaccurate data" : reportReason)
                        } else if case .dialed(let f) = food {
                            try? await APIClient.shared.reportCommunityFood(
                                id: f.id, reason: reportReason.isEmpty ? "Inaccurate data" : reportReason)
                        }
                        reportReason = ""
                    }
                }
                Button("Cancel", role: .cancel) { reportReason = "" }
            } message: {
                Text("Report this food for inaccurate or inappropriate data.")
            }
        }
    }

    private var sourceAccent: Color {
        FoodSourceIndicator.accentColor(for: food.foodSource)
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack(spacing: Spacing.sm) {
                Text(food.displayName)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color.appText)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: FoodSourceIndicator.systemImage(for: food.foodSource))
                    .font(.system(size: 20))
                    .foregroundStyle(sourceAccent)
            }

            if let brand = foodBrand, !brand.isEmpty {
                Text(brand)
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTextSecondary)
            }

            HStack(spacing: Spacing.sm) {
                if let cat = food.foodCategory {
                    Text(cat.displayName)
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextSecondary)
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, 2)
                        .background(Color.appSurfaceSecondary)
                        .clipShape(Capsule())
                }

                Text("\(formatQuantity(food.baseServingSize, unit: food.baseServingUnit)) \(food.baseServingUnit) per serving")
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextTertiary)
            }
        }
        .padding(.horizontal, Spacing.lg)
    }

    private var foodBrand: String? {
        switch food {
        case .custom(let f):    return f.brandName
        case .community(let f), .dialed(let f): return f.brandName
        case .usda:             return nil
        }
    }

    // MARK: - Macro Dashboard

    private var macroDashboardSection: some View {
        let m = food.baseMacros
        return MacroDashboard(cal: m.calories, protein: m.proteinG, carbs: m.carbsG, fat: m.fatG)
            .padding(.horizontal, Spacing.lg)
    }

    // MARK: - Nutrition Details

    @ViewBuilder
    private var nutritionDetailsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showNutritionDetails.toggle()
                }
            } label: {
                HStack {
                    Text("Nutrition Details")
                        .font(.appSubhead)
                        .foregroundStyle(Color.appText)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.appTextSecondary)
                        .rotationEffect(.degrees(showNutritionDetails ? 90 : 0))
                }
            }
            .buttonStyle(.plain)

            if showNutritionDetails {
                let n = food.extendedNutrition
                let m = food.baseMacros
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Divider().padding(.vertical, Spacing.sm)
                    nutritionRow("Total Fat",       value: m.fatG,          unit: "g")
                    nutritionRow("  Saturated Fat", value: n.saturatedFatG, unit: "g",   indent: true)
                    nutritionRow("  Trans Fat",     value: n.transFatG,     unit: "g",   indent: true)
                    nutritionRow("Cholesterol",     value: n.cholesterolMg, unit: "mg")
                    nutritionRow("Sodium",          value: n.sodiumMg,      unit: "mg")
                    nutritionRow("Potassium",       value: n.potassiumMg,   unit: "mg")
                    nutritionRow("Total Carbs",     value: m.carbsG,        unit: "g")
                    nutritionRow("  Fiber",         value: n.fiberG,        unit: "g",   indent: true)
                    nutritionRow("  Sugars",        value: n.sugarG,        unit: "g",   indent: true)
                    nutritionRow("    Added Sugars",value: n.addedSugarG,   unit: "g",   indent: true)
                    nutritionRow("Protein",         value: m.proteinG,      unit: "g")
                    Divider().padding(.vertical, Spacing.sm)
                    nutritionRow("Calcium",         value: n.calciumMg,     unit: "mg")
                    nutritionRow("Iron",            value: n.ironMg,        unit: "mg")
                    nutritionRow("Vitamin D",       value: n.vitaminDMcg,   unit: "mcg")
                }
            }
        }
        .padding(.horizontal, Spacing.lg)
    }

    private func nutritionRow(_ label: String, value: Double?, unit: String, indent: Bool = false) -> some View {
        Group {
            if let v = value {
                HStack {
                    Text(label)
                        .font(indent ? .appCaption1 : .appSubhead)
                        .foregroundStyle(indent ? Color.appTextSecondary : Color.appText)
                    Spacer()
                    Text("\(Self.fmtNutrition(v))\(unit)")
                        .font(indent ? .appCaption1 : .appSubhead)
                        .foregroundStyle(Color.appText)
                }
            }
        }
    }

    private func nutritionRow(_ label: String, value: Double, unit: String, indent: Bool = false) -> some View {
        HStack {
            Text(label)
                .font(indent ? .appCaption1 : .appSubhead)
                .foregroundStyle(indent ? Color.appTextSecondary : Color.appText)
            Spacer()
            Text("\(Self.fmtNutrition(value))\(unit)")
                .font(indent ? .appCaption1 : .appSubhead)
                .foregroundStyle(Color.appText)
        }
    }

    private static func fmtNutrition(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(v))
            : String(format: "%.1f", v)
    }

    // MARK: - Unit Conversions

    @ViewBuilder
    private var conversionsSection: some View {
        // Only show for custom and community foods (not USDA)
        if case .usda = food {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("Unit Conversions")
                    .font(.appSubhead)
                    .foregroundStyle(Color.appText)

                FoodUnitConversionsBlock(
                    overlayPanel:        $vm.overlayPanel,
                    conversions:         vm.mergedConversions,
                    pendingConversions:  [],
                    selectedUnit:        .constant(""),
                    basePills:           [],
                    noUnitSelection:     true,
                    accentColor:         sourceAccent,
                    systemConversionIds: vm.systemConversionIds)

                if vm.mergedConversions.isEmpty && !vm.isLoadingConversions {
                    Text("No custom units yet. Tap + to add one.")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextTertiary)
                }
            }
            .padding(.horizontal, Spacing.lg)
        }
    }

    // MARK: - Metadata

    @ViewBuilder
    private var metadataSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Details")
                .font(.appSubhead)
                .foregroundStyle(Color.appText)

            HStack(spacing: Spacing.lg) {
                metadataBadge(
                    icon: FoodSourceIndicator.systemImage(for: food.foodSource),
                    label: sourceLabel,
                    color: sourceAccent)

                if case .community(let f) = food {
                    metadataBadge(
                        icon: CommunityFoodStatusIndicator.systemImage(for: f.status),
                        label: CommunityFoodStatusIndicator.accessibilityLabel(for: f.status),
                        color: CommunityFoodStatusIndicator.accentColor(for: f.status))

                    metadataBadge(
                        icon: "chart.bar.fill",
                        label: "\(f.usesCount) uses",
                        color: Color.appTextSecondary)

                    if f.trustScore > 0 {
                        metadataBadge(
                            icon: "shield.fill",
                            label: "Trust \(Self.fmtNutrition(f.trustScore))",
                            color: f.trustScore >= 0.7 ? Color.appSuccess : Color.appWarning)
                    }
                }

                if case .dialed(let f) = food {
                    metadataBadge(
                        icon: "checkmark.seal.fill",
                        label: "Dialed",
                        color: Color.appDialed)

                    metadataBadge(
                        icon: "chart.bar.fill",
                        label: "\(f.usesCount) uses",
                        color: Color.appTextSecondary)
                }
            }
        }
        .padding(.horizontal, Spacing.lg)
    }

    private var sourceLabel: String {
        switch food {
        case .custom:    return "My Food"
        case .community: return "Community"
        case .dialed:    return "Dialed"
        case .usda:      return "USDA"
        }
    }

    private func metadataBadge(icon: String, label: String, color: Color) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 12))
            Text(label)
                .font(.appCaption1)
        }
        .foregroundStyle(color)
    }

    // MARK: - Actions

    private var actionsSection: some View {
        VStack(spacing: Spacing.md) {
            // Primary: Log This Food
            Button {
                showQuantityEntry = IdentifiedFood(food: food)
            } label: {
                Text("Log This Food")
                    .font(.appHeadline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.md)
                    .background(sourceAccent)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
            }

            // Custom food actions
            if let custom = food.asCustomFood {
                HStack(spacing: Spacing.md) {
                    if let editAction = onEditCustom {
                        Button {
                            editAction(custom)
                        } label: {
                            Label("Edit", systemImage: "pencil")
                                .font(.appSubhead)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, Spacing.sm)
                                .background(Color.appSurfaceSecondary)
                                .foregroundStyle(Color.appText)
                                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                        }
                    }

                    if let publishAction = onPublishCustom {
                        Button {
                            publishAction(custom)
                        } label: {
                            Label("Publish", systemImage: "arrow.up.circle")
                                .font(.appSubhead)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, Spacing.sm)
                                .background(Color.appSurfaceSecondary)
                                .foregroundStyle(Color.appSuccess)
                                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                        }
                    }
                }

                Button {
                    showDeleteConfirm = true
                } label: {
                    Label("Delete Food", systemImage: "trash")
                        .font(.appSubhead)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.sm)
                        .foregroundStyle(Color.appDestructive)
                }
            }

            // Community food actions
            if food.asCommunityFood != nil {
                Button {
                    showReportSheet = true
                } label: {
                    Label("Report Food", systemImage: "flag")
                        .font(.appSubhead)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.sm)
                        .foregroundStyle(Color.appDestructive)
                }
            }
        }
        .padding(.horizontal, Spacing.lg)
    }
}
