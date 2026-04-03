import SwiftUI

// MARK: - CreateFoodSheet

/// Custom food creation / edit form. Supports .new, .editCustom, .editCommunity, .publishFromCustom.
@MainActor
struct CreateFoodSheet: View {
    let mode:      CreateFoodMode
    let onSaved:   ((CustomFood?) -> Void)?
    let onPublish: ((CustomFood) -> Void)?
    let onDelete:  ((CustomFood) -> Void)?
    let onDismiss: () -> Void

    @State private var vm:                 CreateFoodViewModel
    @State private var showOptional:       Bool = false
    @State private var showBarcode:        Bool = false
    @State private var showBarcodePreview: Bool = false
    @State private var showLabelScanner:   Bool = false
    @State private var showPrefillBanner:  Bool = false
    @State private var showCustomUnitField: Bool = false

    private var isEditCustomMode: Bool {
        if case .editCustom = mode { return true }
        return false
    }

    init(mode: CreateFoodMode,
         vm: CreateFoodViewModel? = nil,
         onSaved: ((CustomFood?) -> Void)? = nil,
         onPublish: ((CustomFood) -> Void)? = nil,
         onDelete: ((CustomFood) -> Void)? = nil,
         onDismiss: @escaping () -> Void) {
        self.mode      = mode
        self.onSaved   = onSaved
        self.onPublish = onPublish
        self.onDelete  = onDelete
        self.onDismiss = onDismiss
        let resolved = vm ?? CreateFoodViewModel(mode: mode)
        _vm = State(initialValue: resolved)
        _showCustomUnitField = State(initialValue: !allServingUnits.contains(resolved.servingUnit))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ScrollView {
                    VStack(spacing: Spacing.lg) {
                        // 1. Personal / Community toggle
                        publishModeRow

                        // 2. Name
                        nameSection

                        // 3. Brand + barcode
                        brandRow

                        // 3b. Category
                        categoryRow

                        // 3c. Community-only fields
                        communityFieldsSection

                        // 4. Serving size + unit
                        servingSizeRow

                        // 5. Unit conversions (before macros)
                        conversionsSection

                        // 6. Macros
                        macrosSection

                        // 7. Optional fields
                        optionalSection

                        // 8. Publish / Delete actions (edit custom only)
                        if case .editCustom(let food) = mode {
                            editActionsSection(food: food)
                        }

                        Spacer(minLength: 100)
                    }
                    .padding(.top, Spacing.md)
                }
                .scrollDismissesKeyboard(.interactively)

                // Unit conversion overlay
                if vm.overlayPanel != .idle {
                    FoodUnitConversionOverlay(
                        overlayPanel:       $vm.overlayPanel,
                        conversions:        vm.visibleExistingConversions,
                        onAdd:              nil,
                        onDelete:           isEditCustomMode ? { convId in
                            vm.deletedConversionIds.insert(convId)
                            vm.existingConversions.removeAll { $0.id == convId }
                        } : nil,
                        pendingConversions: $vm.pendingConversions,
                        isDraftMode:        true,
                        baseServingSize:    Double(vm.servingSizeText) ?? 0,
                        baseServingUnit:    vm.servingUnit,
                        accentColor:        formAccent)
                        .zIndex(10)
                }
            }
            .safeAreaInset(edge: .bottom) {
                if vm.overlayPanel == .idle { saveButton }
            }
            .navigationTitle(vm.navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { onDismiss() }
                }
                // Scan Label button — only for new food creation
                if case .new = mode {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            showLabelScanner = true
                        } label: {
                            Label("Scan Label", systemImage: "text.viewfinder")
                                .labelStyle(.iconOnly)
                        }
                        .tint(formAccent)
                    }
                }
            }
            .overlay(alignment: .top) {
                if showPrefillBanner {
                    prefillBanner
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .zIndex(20)
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: showPrefillBanner)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .fullScreenCover(isPresented: $showLabelScanner) {
            LabelCameraOverlay(
                onScanned: { parsed in
                    showLabelScanner = false
                    vm.prefill(from: parsed)
                    showPrefillBanner = true
                    Task {
                        try? await Task.sleep(for: .seconds(3))
                        showPrefillBanner = false
                    }
                },
                onDismiss: { showLabelScanner = false })
        }
        .fullScreenCover(isPresented: $showBarcode) {
            BarcodeScannerOverlay(
                onScanned: { gtin in
                    showBarcode = false
                    vm.barcode = GTINNormalizer.normalizeToGTIN(gtin)
                },
                onDismiss: { showBarcode = false })
        }
        .sheet(isPresented: $showBarcodePreview) {
            BarcodePreviewSheet(
                barcode:  vm.barcode,
                onRemove: { vm.barcode = ""; showBarcodePreview = false },
                onDismiss: { showBarcodePreview = false })
            .presentationDetents([.height(240)])
            .presentationDragIndicator(.visible)
        }
        .alert("Save Failed", isPresented: Binding(
            get: { vm.saveError != nil },
            set: { if !$0 { vm.saveError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(vm.saveError ?? "")
        }
    }

    // MARK: - Publish Mode Toggle

    @ViewBuilder
    private var publishModeRow: some View {
        switch mode {
        case .new, .publishFromCustom:
            HStack(spacing: 0) {
                modeTogglePill(label: "My Foods", icon: "person", target: .personal)
                modeTogglePill(label: "Community", icon: "person.2", target: .community)
            }
            .background(Color.appSurfaceSecondary)
            .clipShape(Capsule())
            .padding(.horizontal, Spacing.lg)
        case .editCustom, .editCommunity:
            EmptyView()
        }
    }

    private func modeTogglePill(label: String, icon: String, target: PublishMode) -> some View {
        Button {
            vm.publishMode = target
        } label: {
            HStack(spacing: Spacing.xs) {
                Image(systemName: icon)
                Text(label)
            }
            .font(.appSubhead)
            .fontWeight(.semibold)
            .foregroundStyle(vm.publishMode == target ? .white : Color.appTextSecondary)
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm)
            .background(vm.publishMode == target ? formAccent : Color.clear)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Name

    private var nameSection: some View {
        formField(label: "Name *") {
            TextField("e.g. Chicken Breast", text: $vm.name)
        }
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: - Brand + Barcode Row

    private var brandRow: some View {
        HStack(alignment: .top, spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("Barcode")
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextSecondary)
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    if vm.barcode.isEmpty {
                        showBarcode = true
                    } else {
                        showBarcodePreview = true
                    }
                } label: {
                    Image(systemName: "barcode.viewfinder")
                        .font(.system(size: 22))
                        .foregroundStyle(vm.barcode.isEmpty ? Color.appText : formAccent)
                        .frame(width: 80, height: 44)
                        .background(Color.appSurfaceSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                }
                .buttonStyle(.plain)
            }
            formField(label: "Brand name") {
                TextField("Optional", text: $vm.brandName)
            }
        }
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: - Serving Size Row

    private var servingSizeRow: some View {
        HStack(alignment: .bottom, spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("Serving Size *")
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextSecondary)
                TextField("100", text: $vm.servingSizeText)
                    .keyboardType(.decimalPad)
                    .font(.appBody)
                    .padding(Spacing.md)
                    .background(Color.appSurfaceSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                    .frame(width: 80)
            }

            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("Unit")
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextSecondary)
                if showCustomUnitField {
                    HStack(spacing: Spacing.xs) {
                        TextField("e.g. patty", text: $vm.servingUnit)
                            .font(.appBody)
                            .padding(Spacing.md)
                            .background(Color.appSurfaceSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                        Button {
                            vm.servingUnit = "g"
                            showCustomUnitField = false
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 20))
                                .foregroundStyle(Color.appTextTertiary)
                        }
                        .buttonStyle(.plain)
                    }
                    .frame(maxWidth: .infinity)
                } else {
                    Menu {
                        ForEach(allServingUnits, id: \.self) { unit in
                            Button(unit) { vm.servingUnit = unit }
                        }
                        Divider()
                        Button("Custom...") {
                            vm.servingUnit = ""
                            showCustomUnitField = true
                        }
                    } label: {
                        HStack {
                            Text(vm.servingUnit)
                                .font(.appBody)
                            Spacer()
                            Image(systemName: "chevron.up.chevron.down")
                                .font(.system(size: 12))
                                .foregroundStyle(Color.appTextSecondary)
                        }
                        .padding(Spacing.md)
                        .background(Color.appSurfaceSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: - Unit Conversions

    @ViewBuilder
    private var conversionsSection: some View {
        if case .new = mode {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                FoodUnitConversionsBlock(
                    overlayPanel:       $vm.overlayPanel,
                    conversions:        [],
                    pendingConversions:  vm.pendingConversions,
                    selectedUnit:       .constant(""),
                    basePills:          [],
                    noUnitSelection:    true,
                    accentColor:        formAccent)
            }
        } else if case .editCustom = mode {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                FoodUnitConversionsBlock(
                    overlayPanel:       $vm.overlayPanel,
                    conversions:        vm.visibleExistingConversions,
                    pendingConversions:  vm.pendingConversions,
                    selectedUnit:       .constant(""),
                    basePills:          [],
                    noUnitSelection:    true,
                    accentColor:        formAccent)
            }
            .task { await vm.loadConversions() }
        }
    }

    // MARK: - Macros

    private var macrosSection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            sectionHeader("Nutrition (per serving)")

            HStack(spacing: Spacing.md) {
                macroField(label: "Calories *", text: $vm.caloriesText, color: .caloriesAccent)
                macroField(label: "Protein g *", text: $vm.proteinText, color: .proteinAccent)
            }
            HStack(spacing: Spacing.md) {
                macroField(label: "Carbs g *", text: $vm.carbsText, color: .carbsAccent)
                macroField(label: "Fat g *",   text: $vm.fatText,   color: .fatAccent)
            }
        }
        .padding(.horizontal, Spacing.lg)
    }

    private func macroField(label: String, text: Binding<String>, color: Color) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(label)
                .font(.appCaption1)
                .foregroundStyle(color)
            TextField("0", text: text)
                .keyboardType(.decimalPad)
                .font(.appBody)
                .padding(Spacing.md)
                .background(Color.appSurfaceSecondary)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Category

    private var categoryRow: some View {
        HStack {
            Text("Category")
                .font(.appCaption1)
                .foregroundStyle(Color.appTextSecondary)
            Spacer()
            Menu {
                Button("None") { vm.category = nil }
                Divider()
                ForEach(FoodCategory.allCases, id: \.self) { cat in
                    Button(cat.displayName) { vm.category = cat }
                }
            } label: {
                HStack(spacing: Spacing.xs) {
                    Text(vm.category?.displayName ?? "None")
                        .font(.appBody)
                        .foregroundStyle(vm.category == nil ? Color.appTextTertiary : Color.appText)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.appTextSecondary)
                }
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.sm)
                .background(Color.appSurfaceSecondary)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
            }
        }
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: - Community-Only Fields

    @ViewBuilder
    private var communityFieldsSection: some View {
        if vm.publishMode == .community {
            VStack(alignment: .leading, spacing: Spacing.md) {
                formField(label: "Common Name") {
                    TextField("e.g. Chicken Breast", text: $vm.commonName)
                }
            }
            .padding(.horizontal, Spacing.lg)
        }
    }

    // MARK: - Optional Fields

    @ViewBuilder
    private var optionalSection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showOptional.toggle()
                }
            } label: {
                HStack {
                    Text(showOptional ? "Hide optional fields" : "Show optional fields")
                        .font(.appSubhead)
                        .foregroundStyle(formAccent)
                    Spacer()
                    Image(systemName: showOptional ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12))
                        .foregroundStyle(formAccent)
                }
                .padding(.horizontal, Spacing.lg)
            }
            .buttonStyle(.plain)

            if showOptional {
                VStack(spacing: Spacing.md) {
                    HStack(spacing: Spacing.md) {
                        optionalField(label: "Sodium mg",       text: $vm.sodiumText)
                        optionalField(label: "Cholesterol mg",  text: $vm.cholesterolText)
                    }
                    HStack(spacing: Spacing.md) {
                        optionalField(label: "Fiber g",         text: $vm.fiberText)
                        optionalField(label: "Sugar g",         text: $vm.sugarText)
                    }
                    HStack(spacing: Spacing.md) {
                        optionalField(label: "Saturated Fat g", text: $vm.saturatedFatText)
                        optionalField(label: "Trans Fat g",     text: $vm.transFatText)
                    }
                    HStack(spacing: Spacing.md) {
                        optionalField(label: "Potassium mg",    text: $vm.potassiumText)
                        optionalField(label: "Calcium mg",      text: $vm.calciumText)
                    }
                    HStack(spacing: Spacing.md) {
                        optionalField(label: "Iron mg",         text: $vm.ironText)
                        optionalField(label: "Vitamin D mcg",   text: $vm.vitaminDText)
                    }
                    HStack(spacing: Spacing.md) {
                        optionalField(label: "Added Sugar g",   text: $vm.addedSugarText)
                        Spacer().frame(maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, Spacing.lg)
            }
        }
    }

    private func optionalField(label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(label)
                .font(.appCaption1)
                .foregroundStyle(Color.appTextSecondary)
            TextField("0", text: text)
                .keyboardType(.decimalPad)
                .font(.appBody)
                .padding(Spacing.md)
                .background(Color.appSurfaceSecondary)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Edit Actions (Publish / Delete)

    @ViewBuilder
    private func editActionsSection(food: CustomFood) -> some View {
        VStack(spacing: Spacing.sm) {
            if let publishAction = onPublish {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    publishAction(food)
                } label: {
                    HStack(spacing: Spacing.sm) {
                        Image(systemName: "globe")
                        Text("Publish to Community")
                    }
                    .font(.appSubhead)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.appSuccess)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.md)
                    .background(Color.appSuccess.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
                }
                .buttonStyle(.plain)
            }

            if let deleteAction = onDelete {
                Button(role: .destructive) {
                    deleteAction(food)
                    onDismiss()
                } label: {
                    HStack(spacing: Spacing.sm) {
                        Image(systemName: "trash")
                        Text("Delete Food")
                    }
                    .font(.appSubhead)
                    .foregroundStyle(Color.appDestructive)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.md)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: - Save Button

    private var saveButton: some View {
        Button {
            Task {
                do {
                    let food = try await vm.save()
                    onSaved?(food)
                    onDismiss()
                } catch {
                    vm.saveError = error.localizedDescription
                }
            }
        } label: {
            Group {
                if vm.isSaving {
                    ProgressView().tint(.white)
                } else {
                    Text(vm.saveButtonTitle)
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.md + 2)
            .background(vm.isValid ? formAccent : Color.appBorder)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        }
        .buttonStyle(.plain)
        .disabled(!vm.isValid || vm.isSaving)
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.sm)
        .background(Color.appSurface.ignoresSafeArea())
    }

    // MARK: - Prefill Banner

    private var prefillBanner: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Color.appSuccess)
            Text("Label scanned — review and save")
                .font(.appSubhead)
                .foregroundStyle(Color.appText)
            Spacer()
        }
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, Spacing.sm)
        .background(Color.appSurface.shadow(.drop(radius: 4, y: 2)))
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
        .padding(.horizontal, Spacing.lg)
        .padding(.top, Spacing.sm)
    }

    // MARK: - Helpers

    /// Blue for personal / My Foods; green when publishing to community so the mode is obvious.
    private var formAccent: Color {
        vm.publishMode == .community ? Color.appSuccess : Color.appTint
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.appHeadline)
            .foregroundStyle(Color.appText)
    }

    private func formField<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(label)
                .font(.appCaption1)
                .foregroundStyle(Color.appTextSecondary)
            content()
                .font(.appBody)
                .padding(Spacing.md)
                .background(Color.appSurfaceSecondary)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
        }
    }
}
