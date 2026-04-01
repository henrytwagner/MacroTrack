import SwiftUI
import UIKit

// MARK: - FoodDetailSheet

/// Add/edit sheet for a food item.
/// - Add mode: presented via .sheet(item: $detailFood) from FoodSearchView.
/// - Edit mode: presented via .sheet(item: $editingEntry) from LogView — uses ratio-based scaling
///   over the originally logged macros, no food lookup required.
@MainActor
struct FoodDetailSheet: View {
    @Environment(DailyLogStore.self) private var logStore
    @Environment(GoalStore.self)     private var goalStore
    @Environment(DateStore.self)     private var dateStore

    let identifiedFood:  IdentifiedFood
    let editingEntry:    FoodEntry?       // non-nil when editing an existing log entry
    let onDismiss:       () -> Void
    let onEditCustom:    ((CustomFood) -> Void)?
    let onPublishCustom: ((CustomFood) -> Void)?
    let onDeleteEntry:   (() -> Void)?
    /// When non-nil, the sheet is in "ingredient picker" mode: the button says "Add to Meal"
    /// and calls this closure instead of writing a FoodEntry to the log.
    let onAddToMeal:     ((SavedMealItem) -> Void)?

    @State private var vm: FoodDetailViewModel

    // MARK: - Inits

    /// Add mode — called from FoodSearchView.
    init(identifiedFood: IdentifiedFood,
         onDismiss: @escaping () -> Void,
         onEditCustom:    ((CustomFood) -> Void)? = nil,
         onPublishCustom: ((CustomFood) -> Void)? = nil,
         onAddToMeal:     ((SavedMealItem) -> Void)? = nil) {
        self.identifiedFood  = identifiedFood
        self.editingEntry    = nil
        self.onDismiss       = onDismiss
        self.onEditCustom    = onEditCustom
        self.onPublishCustom = onPublishCustom
        self.onDeleteEntry   = nil
        self.onAddToMeal     = onAddToMeal
        _vm = State(initialValue: FoodDetailViewModel(food: identifiedFood.food, mode: .add))
    }

    /// Edit mode — called from LogView when tapping a logged entry.
    /// Synthesizes an AnyFood from the entry so the existing VM's ratio-based scaling works correctly:
    /// `scaleFactor = newQty / entry.quantity`, `scaledMacros = entryMacros × scaleFactor`.
    init(entry: FoodEntry,
         onDismiss: @escaping () -> Void,
         onEditCustom: ((CustomFood) -> Void)? = nil,
         onDeleteEntry: (() -> Void)? = nil) {
        // Build a synthetic CustomFood whose base serving == entry's logged amount.
        // This makes scaleFactor = newQty / entry.quantity = pure ratio scaling.
        let syntheticFood = CustomFood(
            id:            entry.customFoodId ?? entry.id,
            name:          entry.name,
            brandName:     nil,
            servingSize:   entry.quantity,
            servingUnit:   entry.unit,
            calories:      entry.calories,
            proteinG:      entry.proteinG,
            carbsG:        entry.carbsG,
            fatG:          entry.fatG,
            sodiumMg:      nil,
            cholesterolMg: nil,
            fiberG:        nil,
            sugarG:        nil,
            saturatedFatG: nil,
            transFatG:     nil,
            barcode:       nil,
            createdAt:     "",
            updatedAt:     "")
        let anyFood = AnyFood.custom(syntheticFood)
        self.identifiedFood  = IdentifiedFood(food: anyFood, sourceOverride: entry.source)
        self.editingEntry    = entry
        self.onDismiss       = onDismiss
        self.onEditCustom    = onEditCustom
        self.onPublishCustom = nil
        self.onDeleteEntry   = onDeleteEntry
        self.onAddToMeal     = nil
        _vm = State(initialValue: FoodDetailViewModel(food: anyFood, mode: .edit(entry)))
    }

    // MARK: - Computed preview totals

    private var previewTotals: Macros {
        let t = logStore.totals
        let m = vm.scaledMacros
        if let old = editingEntry {
            // Edit mode: subtract the old logged values, add the new scaled values
            return Macros(
                calories: t.calories - old.calories + m.calories,
                proteinG: t.proteinG - old.proteinG + m.proteinG,
                carbsG:   t.carbsG   - old.carbsG   + m.carbsG,
                fatG:     t.fatG     - old.fatG      + m.fatG)
        }
        // Add mode: day totals + this portion
        return Macros(
            calories: t.calories + m.calories,
            proteinG: t.proteinG + m.proteinG,
            carbsG:   t.carbsG   + m.carbsG,
            fatG:     t.fatG     + m.fatG)
    }

    private var isEditMode: Bool { editingEntry != nil }

    private var canEditFood: Bool {
        onEditCustom != nil && (
            isEditMode ? editingEntry?.customFoodId != nil : identifiedFood.food.asCustomFood != nil
        )
    }

    private var hasOverflowActions: Bool {
        canEditFood || (isEditMode && onDeleteEntry != nil)
    }

    var body: some View {
        ZStack {
            // Main scrollable form
            ScrollView {
                VStack(spacing: Spacing.lg) {
                    sheetHeader
                    dayPreviewSection
                    foodInfoSection
                    quantitySection
                    if !(vm.scaleWeighingActive && scaleConnected) {
                        macroDashboardSection
                    }
                    Spacer(minLength: 100)
                }
                .padding(.top, Spacing.sm)
            }
            .scrollDismissesKeyboard(.interactively)

            // Conversion overlay (zIndex 10)
            if vm.overlayPanel != .idle {
                FoodUnitConversionOverlay(
                    overlayPanel:       $vm.overlayPanel,
                    conversions:        vm.conversions,
                    onAdd:              { unit, qty in
                        let food = identifiedFood.food
                        let req  = CreateFoodUnitConversionRequest(
                            unitName:               unit,
                            quantityInBaseServings: qty,
                            customFoodId:           food.asCustomFood?.id,
                            usdaFdcId:              food.asUSDA?.fdcId,
                            measurementSystem:      nil)
                        try await vm.addConversion(req)
                    },
                    onDelete:           { id in try await vm.deleteConversion(id: id) },
                    pendingConversions: .constant([]),
                    isDraftMode:        false,
                    baseServingSize:    identifiedFood.food.baseServingSize,
                    baseServingUnit:    identifiedFood.food.baseServingUnit)
                    .zIndex(10)
            }

            // USDA warning overlay
            if vm.showUsdaWarning {
                usdaWarningOverlay
                    .zIndex(20)
            }
        }
        .safeAreaInset(edge: .bottom) { saveButton }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .task {
            await vm.loadConversions()
            if !isEditMode { await vm.loadPreferences() }
            if vm.foodHasWeightUnit {
                ScaleManager.shared.autoConnectIfNeeded()
            }
        }
        .onChange(of: ScaleManager.shared.latestReading) { _, newReading in
            vm.updateStableMacroPreview(reading: newReading)
        }
        .onChange(of: ScaleManager.shared.connectionState) { oldState, newState in
            if oldState == .connected && newState != .connected {
                vm.handleScaleDisconnect()
            }
        }
    }

    // MARK: - Sheet Header

    private var sheetHeader: some View {
        HStack {
            Spacer()
            if hasOverflowActions {
                overflowMenu
            }
        }
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: - Overflow Menu

    private var overflowMenu: some View {
        Menu {
            if canEditFood, let editAction = onEditCustom,
               let custom = identifiedFood.food.asCustomFood {
                Section("Food") {
                    Button {
                        editAction(custom)
                    } label: {
                        Label("Edit Nutrition Info", systemImage: "pencil")
                    }
                }
            }

            if isEditMode, let deleteAction = onDeleteEntry {
                Section("Log Entry") {
                    Button(role: .destructive) {
                        deleteAction()
                        onDismiss()
                    } label: {
                        Label("Delete from Log", systemImage: "trash")
                    }
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color.appTextSecondary)
                .frame(width: 32, height: 32)
                .background(Color.appSurfaceSecondary)
                .clipShape(Circle())
        }
    }

    // MARK: - Food Info

    private var foodInfoSection: some View {
        let source = identifiedFood.sourceOverride ?? identifiedFood.food.foodSource
        return HStack(spacing: Spacing.sm) {
            Text(identifiedFood.food.displayName)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Color.appText)
                .frame(maxWidth: .infinity, alignment: .leading)

            Image(systemName: FoodSourceIndicator.systemImage(for: source))
                .font(.system(size: 20))
                .foregroundStyle(FoodSourceIndicator.accentColor(for: source))
                .accessibilityLabel(sourceAccessibilityLabel(source))
        }
        .padding(.horizontal, Spacing.lg)
    }

    private func sourceAccessibilityLabel(_ source: FoodSource) -> String {
        switch source {
        case .custom:    return "My food"
        case .community: return "Community food"
        case .database:  return "USDA database food"
        }
    }

    // MARK: - Day Preview

    private var dayPreviewSection: some View {
        let goals = goalStore.goalsByDate[dateStore.selectedDate] ?? nil

        return Group {
            if let g = goals {
                DashboardMacroCard(totals: previewTotals, goals: g)
            } else {
                MacroRingProgress(totals: previewTotals, goals: nil, variant: .default, showCalorieRing: true)
            }
        }
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: - Macro Dashboard

    private var macroDashboardSection: some View {
        MacroDashboard(
            cal: vm.scaledMacros.calories,
            protein: vm.scaledMacros.proteinG,
            carbs: vm.scaledMacros.carbsG,
            fat: vm.scaledMacros.fatG
        )
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: - Quantity

    private var scaleConnected: Bool {
        ScaleManager.shared.connectionState == .connected
    }

    @ViewBuilder
    private var quantitySection: some View {
        if vm.scaleWeighingActive && scaleConnected {
            if vm.isSubtractiveMode {
                subtractiveWeighingSection
            } else {
                scaleWeighingSection
            }
        } else {
            manualQuantitySection
        }
    }

    // MARK: Manual Quantity (default)

    private var manualQuantitySection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Quantity")
                .font(.appHeadline)
                .foregroundStyle(Color.appText)

            HStack(spacing: Spacing.sm) {
                ZStack(alignment: .leading) {
                    TextField("Amount", text: $vm.quantityText)
                        .keyboardType(.decimalPad)
                        .font(.appTitle2)
                        .padding(Spacing.md)
                        .background(Color.appSurfaceSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))

                    // Scale ghost text — shown when connected with stable reading and field is empty
                    if vm.quantityText.isEmpty,
                       let reading = ScaleManager.shared.latestReading,
                       reading.stable,
                       scaleConnected {
                        Button {
                            let foodUnit = scaleUnitToFoodUnit(reading.unit)
                            vm.quantityText = formatQuantity(reading.value, unit: foodUnit)
                            vm.selectedUnit = foodUnit
                        } label: {
                            HStack(spacing: Spacing.xs) {
                                Image(systemName: "scalemass.fill")
                                    .font(.system(size: 14))
                                Text(reading.display)
                                    .font(.appTitle2)
                            }
                            .foregroundStyle(Color.appTint.opacity(0.5))
                            .padding(Spacing.md)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(maxWidth: .infinity)

                // Inline unit dropdown
                Menu {
                    ForEach(vm.unitPills, id: \.self) { unit in
                        Button(unit) { vm.selectedUnit = unit }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(vm.selectedUnit)
                            .font(.appSubhead)
                            .foregroundStyle(Color.appText)
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.system(size: 11))
                            .foregroundStyle(Color.appTextSecondary)
                    }
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.md)
                    .background(Color.appSurfaceSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                }

                // Scale button — opt-in to scale weighing
                if vm.foodHasWeightUnit {
                    Button {
                        if scaleConnected {
                            vm.enterScaleWeighing()
                        } else {
                            ScaleManager.shared.autoConnectIfNeeded()
                        }
                    } label: {
                        Image(systemName: "scalemass.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(scaleConnected ? Color.appTint : Color.appTextTertiary)
                            .padding(Spacing.sm)
                            .background((scaleConnected ? Color.appTint : Color.appTextTertiary).opacity(0.1))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }
            }

            if unitUsesFractionKeyboard(vm.selectedUnit) {
                FractionBar(text: $vm.quantityText)
            }

            HStack {
                // Manage unit conversions — only shown in add mode
                if !isEditMode {
                    Button {
                        vm.overlayPanel = .preview
                    } label: {
                        Text("Manage units")
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextSecondary)
                    }
                    .buttonStyle(.plain)
                }

                Spacer()

                // Scale-confirmed badge
                if vm.confirmedViaScale {
                    HStack(spacing: Spacing.xs) {
                        Image(systemName: "scalemass.fill")
                            .font(.system(size: 11))
                        Text("Weighed")
                            .font(.appCaption2)
                    }
                    .foregroundStyle(Color.appTint)
                }
            }

            // Serving info
            Text("Serving: \(formatQuantity(identifiedFood.food.baseServingSize, unit: identifiedFood.food.baseServingUnit)) \(identifiedFood.food.baseServingUnit)")
                .font(.appCaption1)
                .foregroundStyle(Color.appTextSecondary)
        }
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: Scale Weighing

    private var scaleWeighingSection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Quantity")
                .font(.appHeadline)
                .foregroundStyle(Color.appText)

            if let reading = vm.adjustedScaleReading {
                // Live weight display
                Text(reading.display)
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.appTint)
                    .contentTransition(.numericText())
                    .animation(.easeOut(duration: 0.15), value: reading.display)

                // Stability badge
                HStack(spacing: Spacing.xs) {
                    Circle()
                        .fill(reading.stable ? Color.appSuccess : Color.appTextTertiary)
                        .frame(width: 6, height: 6)
                    Text(reading.stable ? "Stable" : "Measuring\u{2026}")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(reading.stable ? Color.appSuccess : Color.appTextSecondary)
                }

                // Macro preview (stable readings only)
                if let macros = vm.stableMacroPreview {
                    MacroDashboard(cal: macros.calories, protein: macros.proteinG,
                                   carbs: macros.carbsG, fat: macros.fatG)
                }

                // Zero button + Keep Zero toggle
                HStack(spacing: Spacing.sm) {
                    Button {
                        if vm.zeroOffset != nil {
                            vm.clearZero()
                        } else {
                            vm.zeroScale()
                        }
                    } label: {
                        HStack(spacing: Spacing.xs) {
                            Image(systemName: vm.zeroOffset != nil ? "arrow.counterclockwise" : "scope")
                                .font(.system(size: 12))
                            Text(vm.zeroOffset != nil ? "Reset Zero" : "Zero")
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundStyle(vm.zeroOffset != nil ? Color.caloriesAccent : Color.appTextSecondary)
                    }
                    .buttonStyle(.plain)

                    if vm.zeroOffset != nil {
                        Button {
                            vm.toggleKeepZero()
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: vm.keepZeroOffset ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 11))
                                Text("Keep zero")
                                    .font(.system(size: 11))
                            }
                            .foregroundStyle(vm.keepZeroOffset ? Color.appTint : Color.appTextSecondary)
                        }
                        .buttonStyle(.plain)
                    }

                    Spacer()
                }
            } else {
                // Connected but no reading yet
                HStack(spacing: Spacing.sm) {
                    ProgressView()
                        .tint(Color.appTextSecondary)
                    Text("Place food on scale\u{2026}")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.appTextSecondary)
                }
                .padding(.vertical, Spacing.md)
            }

            // Manual fallback
            Button {
                vm.exitScaleWeighing()
            } label: {
                HStack(spacing: Spacing.xs) {
                    Image(systemName: "pencil")
                        .font(.system(size: 12))
                    Text("Set manually")
                        .font(.system(size: 12))
                }
                .foregroundStyle(Color.appTextSecondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: Subtractive Weighing

    private var subtractiveWeighingSection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Subtractive Weighing")
                .font(.appHeadline)
                .foregroundStyle(Color.appText)

            // Start weight (locked)
            HStack(spacing: Spacing.sm) {
                Text("Start:")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.appTextSecondary)
                Text("\(formatQuantity(vm.subtractiveStartWeight ?? 0, unit: vm.subtractiveStartUnit?.rawValue ?? "g")) \(vm.subtractiveStartUnit?.rawValue ?? "g")")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.appTextSecondary)
                Image(systemName: "lock.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(Color.appSuccess)
            }

            // Current weight (live)
            if let reading = vm.adjustedScaleReading {
                HStack(spacing: Spacing.sm) {
                    Text("Now:")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.appTextSecondary)
                    Text(reading.display)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Color.appTextSecondary)
                        .contentTransition(.numericText())
                        .animation(.easeOut(duration: 0.15), value: reading.display)
                }
            }

            // Delta (hero-sized)
            if let delta = vm.subtractiveDelta {
                let unitStr = vm.subtractiveStartUnit?.rawValue ?? "g"
                Text("\u{0394} Food: \(formatQuantity(delta, unit: unitStr)) \(unitStr)")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.appTint)
                    .contentTransition(.numericText())
                    .animation(.easeOut(duration: 0.15), value: delta)

                // Macro preview based on delta
                if let macros = scaledMacrosForWeight(
                    value: delta,
                    unitRaw: unitStr,
                    baseMacros: identifiedFood.food.baseMacros,
                    baseServingSize: identifiedFood.food.baseServingSize,
                    baseServingUnit: identifiedFood.food.baseServingUnit) {
                    MacroDashboard(cal: macros.calories, protein: macros.proteinG,
                                   carbs: macros.carbsG, fat: macros.fatG)
                }
            }

        }
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: - USDA Warning Overlay

    private var usdaWarningOverlay: some View {
        ZStack {
            Color.black.opacity(0.4).ignoresSafeArea()

            VStack(spacing: Spacing.lg) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(Color.appWarning)

                Text("USDA Data Quality Note")
                    .font(.appTitle3)
                    .foregroundStyle(Color.appText)

                Text("USDA nutrition data can have inconsistent serving sizes and incomplete nutrient info. For accurate tracking, prefer community or personal foods when available.")
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTextSecondary)
                    .multilineTextAlignment(.center)

                Button {
                    Task { await vm.dismissUsdaWarning(dontWarnAgain: false) }
                } label: {
                    Text("Got it")
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.md)
                        .background(Color.appTint)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                }
                .buttonStyle(.plain)

                Button {
                    Task { await vm.dismissUsdaWarning(dontWarnAgain: true) }
                } label: {
                    Text("Don't warn me again")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextSecondary)
                }
                .buttonStyle(.plain)
            }
            .padding(Spacing.xl)
            .background(Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.xl))
            .padding(Spacing.xl)
        }
    }

    // MARK: - Save Button

    @ViewBuilder
    private var saveButton: some View {
        if vm.scaleWeighingActive && scaleConnected && !vm.isSubtractiveMode {
            scaleBottomButtons
        } else if vm.scaleWeighingActive && scaleConnected && vm.isSubtractiveMode {
            subtractiveBottomButtons
        } else {
            normalSaveButton
        }
    }

    private var scaleBottomButtons: some View {
        let reading = vm.adjustedScaleReading
        let canLock = reading != nil && reading!.value > 0 && reading!.stable
        return HStack(spacing: Spacing.sm) {
            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                vm.confirmScaleReading()
            } label: {
                HStack(spacing: Spacing.sm) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 15))
                    Text("Lock in")
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.md + 2)
                .background(canLock ? Color.appTint : Color.appTint.opacity(0.4))
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
            }
            .buttonStyle(.plain)
            .disabled(!canLock)

            Button {
                vm.startSubtractiveMode()
            } label: {
                HStack(spacing: Spacing.sm) {
                    Image(systemName: "minus.circle")
                        .font(.system(size: 15))
                    Text("Subtract")
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                }
                .foregroundStyle(Color.appText)
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, Spacing.md + 2)
                .background(Color.appSurfaceSecondary)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
                .overlay(RoundedRectangle(cornerRadius: BorderRadius.lg).stroke(Color.appBorder, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.sm)
        .background(Color.appSurface.ignoresSafeArea())
    }

    private var subtractiveBottomButtons: some View {
        let delta = vm.subtractiveDelta ?? 0
        let unitStr = vm.subtractiveStartUnit?.rawValue ?? "g"
        let canLock = delta > 0
        return HStack(spacing: Spacing.sm) {
            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                vm.confirmSubtractiveDelta()
            } label: {
                HStack(spacing: Spacing.sm) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 15))
                    Text("Lock in \(formatQuantity(delta, unit: unitStr)) \(unitStr)")
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.md + 2)
                .background(canLock ? Color.appTint : Color.appTint.opacity(0.4))
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
            }
            .buttonStyle(.plain)
            .disabled(!canLock)

            Button {
                vm.cancelSubtractiveMode()
            } label: {
                Text("Cancel")
                    .font(.appSubhead)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.appText)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.vertical, Spacing.md + 2)
                    .background(Color.appSurfaceSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
                    .overlay(RoundedRectangle(cornerRadius: BorderRadius.lg).stroke(Color.appBorder, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.sm)
        .background(Color.appSurface.ignoresSafeArea())
    }

    private var normalSaveButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            if let addToMeal = onAddToMeal {
                let m    = vm.scaledMacros
                let food = identifiedFood.food
                let item = SavedMealItem(
                    id:              UUID().uuidString,
                    name:            food.displayName,
                    quantity:        vm.quantity,
                    unit:            vm.selectedUnit,
                    calories:        m.calories,
                    proteinG:        m.proteinG,
                    carbsG:          m.carbsG,
                    fatG:            m.fatG,
                    source:          food.foodSource,
                    usdaFdcId:       food.asUSDA?.fdcId,
                    customFoodId:    food.asCustomFood?.id,
                    communityFoodId: food.asCommunityFood?.id)
                addToMeal(item)
                onDismiss()
            } else {
                Task {
                    do {
                        if let entry = editingEntry {
                            _ = try await vm.updateEntry(id: entry.id, logStore: logStore)
                        } else {
                            _ = try await vm.saveEntry(date: dateStore.selectedDate, logStore: logStore)
                        }
                        onDismiss()
                    } catch {
                        // TODO: surface error
                    }
                }
            }
        } label: {
            Group {
                if vm.isSaving {
                    ProgressView().tint(.white)
                } else {
                    let label = onAddToMeal != nil ? "Add to Meal"
                               : isEditMode       ? "Save"
                               :                    "Add to Log"
                    Text(label)
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.md + 2)
            .background(vm.quantity > 0 ? Color.appTint : Color.appBorder)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        }
        .buttonStyle(.plain)
        .disabled(vm.quantity <= 0 || vm.isSaving)
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.sm)
        .background(Color.appSurface.ignoresSafeArea())
    }

    // MARK: - Helpers

    private func scaleUnitToFoodUnit(_ unit: ScaleUnit) -> String {
        switch unit {
        case .g: return "g"
        case .ml: return "ml"
        case .oz: return "oz"
        case .lbOz: return "oz"
        }
    }
}
