import SwiftUI

// MARK: - NutritionLabelConfirmationSheet

/// Confirmation screen shown after scanning a nutrition label.
/// Displays parsed data with original-vs-canonical unit display,
/// allows user to override unit/quantity, and hands off to CreateFoodSheet.
@MainActor
struct NutritionLabelConfirmationSheet: View {
    let parsedLabel: ParsedNutritionLabel
    let onConfirm: (ParsedNutritionLabel) -> Void
    let onDismiss: () -> Void

    // Editable copies of parsed values
    @State private var quantityText: String
    @State private var selectedUnit: String
    @State private var caloriesText: String
    @State private var proteinText: String
    @State private var carbsText: String
    @State private var fatText: String
    @State private var nameText: String
    @State private var brandText: String

    // Track original serving for macro scaling
    private let originalQuantity: Double
    private let originalUnit: String

    init(parsedLabel: ParsedNutritionLabel,
         onConfirm: @escaping (ParsedNutritionLabel) -> Void,
         onDismiss: @escaping () -> Void) {
        self.parsedLabel = parsedLabel
        self.onConfirm = onConfirm
        self.onDismiss = onDismiss

        let ss = parsedLabel.servingSize
        self.originalQuantity = ss.canonicalQuantity
        self.originalUnit = ss.canonicalUnit

        _quantityText = State(initialValue: Self.fmt(ss.canonicalQuantity))
        _selectedUnit = State(initialValue: ss.canonicalUnit)
        _caloriesText = State(initialValue: parsedLabel.calories.map { Self.fmt($0) } ?? "")
        _proteinText  = State(initialValue: parsedLabel.proteinG.map { Self.fmt($0) } ?? "")
        _carbsText    = State(initialValue: parsedLabel.carbsG.map { Self.fmt($0) } ?? "")
        _fatText      = State(initialValue: parsedLabel.fatG.map { Self.fmt($0) } ?? "")
        _nameText     = State(initialValue: parsedLabel.name ?? "")
        _brandText    = State(initialValue: parsedLabel.brandName ?? "")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.lg) {
                    // Review flags banner
                    if !parsedLabel.reviewFlags.isEmpty {
                        reviewFlagsBanner
                    }

                    // Name & brand
                    nameSection

                    // Serving size with original label
                    servingSizeSection

                    // Macros
                    macrosSection

                    Spacer(minLength: 80)
                }
                .padding(.top, Spacing.md)
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) {
                confirmButton
            }
            .navigationTitle("Confirm Label")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { onDismiss() }
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Review Flags Banner

    private var reviewFlagsBanner: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack(spacing: Spacing.xs) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(Color.appWarning)
                Text("Needs Review")
                    .font(.appSubhead).fontWeight(.semibold)
            }
            ForEach(parsedLabel.reviewFlags, id: \.self) { flag in
                Text("- \(flag)")
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextSecondary)
            }
        }
        .padding(Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.appWarning.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: - Name Section

    private var nameSection: some View {
        VStack(spacing: Spacing.md) {
            formField(label: "Name") {
                TextField("Product name", text: $nameText)
            }
            formField(label: "Brand") {
                TextField("Optional", text: $brandText)
            }
        }
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: - Serving Size

    private var servingSizeSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Serving Size")
                .font(.appCaption1)
                .foregroundStyle(Color.appTextSecondary)

            // Show original label if it differs from canonical
            if parsedLabel.servingSize.status == .converted ||
               parsedLabel.servingSize.originalUnit != nil {
                HStack(spacing: Spacing.xs) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.appTint)
                    Text(parsedLabel.servingSize.originalLabel)
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextSecondary)
                }
            }

            HStack(spacing: Spacing.md) {
                TextField("Amount", text: $quantityText)
                    .keyboardType(.decimalPad)
                    .font(.appBody)
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.sm)
                    .background(Color.appSurfaceSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                    .frame(maxWidth: 120)

                Picker("Unit", selection: $selectedUnit) {
                    ForEach(allServingUnits, id: \.self) { unit in
                        Text(unit).tag(unit)
                    }
                }
                .pickerStyle(.menu)
                .tint(Color.appTint)
            }
        }
        .padding(.horizontal, Spacing.lg)
        .onChange(of: selectedUnit) { oldUnit, newUnit in
            handleUnitChange(from: oldUnit, to: newUnit)
        }
    }

    // MARK: - Macros

    private var macrosSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Nutrition per serving")
                .font(.appCaption1)
                .foregroundStyle(Color.appTextSecondary)

            LazyVGrid(columns: [
                GridItem(.flexible()), GridItem(.flexible())
            ], spacing: Spacing.md) {
                macroField(label: "Calories", text: $caloriesText, color: Color.caloriesAccent)
                macroField(label: "Protein (g)", text: $proteinText, color: Color.proteinAccent)
                macroField(label: "Carbs (g)", text: $carbsText, color: Color.carbsAccent)
                macroField(label: "Fat (g)", text: $fatText, color: Color.fatAccent)
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
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.sm)
                .background(Color.appSurfaceSecondary)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
        }
    }

    // MARK: - Confirm Button

    private var confirmButton: some View {
        Button {
            onConfirm(buildResult())
        } label: {
            Text("Confirm & Create Food")
                .font(.appBody).fontWeight(.semibold)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.md)
                .background(Color.appTint)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.sm)
    }

    // MARK: - Helpers

    private func formField<Content: View>(label: String,
                                           @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(label)
                .font(.appCaption1)
                .foregroundStyle(Color.appTextSecondary)
            content()
                .font(.appBody)
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.sm)
                .background(Color.appSurfaceSecondary)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
        }
    }

    /// When user changes the serving unit via picker, attempt to convert the quantity.
    private func handleUnitChange(from oldUnit: String, to newUnit: String) {
        guard let qty = Double(quantityText), qty > 0 else { return }

        // Use local ratio tables (same as NutritionLabelParser._Ratios)
        let weightG: [String: Double] = [
            "g": 1.0, "oz": 28.3495, "kg": 1000.0, "lb": 453.592
        ]
        let volumeMl: [String: Double] = [
            "ml": 1.0, "L": 1000.0, "fl oz": 29.5735,
            "tbsp": 14.7868, "tsp": 4.92892, "cups": 236.588
        ]

        let converted: Double?
        if let fromG = weightG[oldUnit], let toG = weightG[newUnit] {
            converted = qty * fromG / toG
        } else if let fromMl = volumeMl[oldUnit], let toMl = volumeMl[newUnit] {
            converted = qty * fromMl / toMl
        } else {
            converted = nil
        }

        if let c = converted {
            quantityText = Self.fmt(c)
        }
        // If cross-system (weight ↔ volume) or abstract, leave quantity unchanged
    }

    private func buildResult() -> ParsedNutritionLabel {
        let newQty = Double(quantityText) ?? originalQuantity
        // Scale macros if quantity changed relative to original
        let scale = originalQuantity > 0 ? newQty / originalQuantity : 1.0

        return ParsedNutritionLabel(
            name: nameText.isEmpty ? nil : nameText,
            brandName: brandText.isEmpty ? nil : brandText,
            servingSize: ParsedServingSize(
                canonicalQuantity: newQty,
                canonicalUnit: selectedUnit,
                originalLabel: parsedLabel.servingSize.originalLabel,
                originalQuantity: parsedLabel.servingSize.originalQuantity,
                originalUnit: parsedLabel.servingSize.originalUnit,
                status: parsedLabel.servingSize.status
            ),
            calories: (Double(caloriesText) ?? parsedLabel.calories).map { $0 * scale },
            proteinG: (Double(proteinText) ?? parsedLabel.proteinG).map { $0 * scale },
            carbsG: (Double(carbsText) ?? parsedLabel.carbsG).map { $0 * scale },
            fatG: (Double(fatText) ?? parsedLabel.fatG).map { $0 * scale },
            sodiumMg: parsedLabel.sodiumMg.map { $0 * scale },
            cholesterolMg: parsedLabel.cholesterolMg.map { $0 * scale },
            fiberG: parsedLabel.fiberG.map { $0 * scale },
            sugarG: parsedLabel.sugarG.map { $0 * scale },
            saturatedFatG: parsedLabel.saturatedFatG.map { $0 * scale },
            transFatG: parsedLabel.transFatG.map { $0 * scale },
            reviewFlags: parsedLabel.reviewFlags
        )
    }

    private static func fmt(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(v))
            : String(format: "%.1f", v)
    }
}

// MARK: - CreateFoodSheetWithLabel

/// Thin wrapper that presents CreateFoodSheet pre-filled from a parsed nutrition label.
/// Needed because CreateFoodSheet creates its own ViewModel internally,
/// and we need to call `prefill(from:)` after init.
@MainActor
struct CreateFoodSheetWithLabel: View {
    let label: ParsedNutritionLabel
    let onSaved: ((CustomFood?) -> Void)?
    let onDismiss: () -> Void

    @State private var vm: CreateFoodViewModel

    init(label: ParsedNutritionLabel,
         onSaved: ((CustomFood?) -> Void)? = nil,
         onDismiss: @escaping () -> Void) {
        self.label = label
        self.onSaved = onSaved
        self.onDismiss = onDismiss
        let viewModel = CreateFoodViewModel(mode: .new(prefillName: label.name, prefillBarcode: nil))
        viewModel.prefill(from: label)
        _vm = State(initialValue: viewModel)
    }

    var body: some View {
        CreateFoodSheet(
            mode: .new(prefillName: label.name, prefillBarcode: nil),
            vm: vm,
            onSaved: onSaved,
            onDismiss: onDismiss)
    }
}
