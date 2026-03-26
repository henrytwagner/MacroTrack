import SwiftUI

// MARK: - CreateFoodSheet

/// Custom food creation / edit form. Supports .new, .editCustom, .editCommunity, .publishFromCustom.
@MainActor
struct CreateFoodSheet: View {
    let mode:      CreateFoodMode
    let onSaved:   ((CustomFood?) -> Void)?
    let onDismiss: () -> Void

    @State private var vm:          CreateFoodViewModel
    @State private var showOptional:       Bool = false
    @State private var showBarcode:        Bool = false
    @State private var showBarcodePreview: Bool = false

    init(mode: CreateFoodMode,
         onSaved: ((CustomFood?) -> Void)? = nil,
         onDismiss: @escaping () -> Void) {
        self.mode      = mode
        self.onSaved   = onSaved
        self.onDismiss = onDismiss
        _vm = State(initialValue: CreateFoodViewModel(mode: mode))
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

                        // 4. Serving size + unit
                        servingSizeRow

                        // 5. Unit conversions (before macros)
                        conversionsSection

                        // 6. Macros
                        macrosSection

                        // 7. Optional fields
                        optionalSection

                        Spacer(minLength: 100)
                    }
                    .padding(.top, Spacing.md)
                }
                .scrollDismissesKeyboard(.interactively)

                // Unit conversion overlay
                if vm.overlayPanel != .idle {
                    FoodUnitConversionOverlay(
                        overlayPanel:       $vm.overlayPanel,
                        conversions:        [],
                        onAdd:              nil,
                        onDelete:           nil,
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
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
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
                Menu {
                    ForEach(allServingUnits, id: \.self) { unit in
                        Button(unit) { vm.servingUnit = unit }
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
