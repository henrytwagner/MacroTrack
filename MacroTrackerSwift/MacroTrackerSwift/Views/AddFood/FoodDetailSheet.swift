import SwiftUI
import UIKit

// MARK: - FoodDetailSheet

/// Add/edit sheet for a food item. Presented via .sheet(item: $detailFood).
@MainActor
struct FoodDetailSheet: View {
    @Environment(DailyLogStore.self) private var logStore
    @Environment(GoalStore.self)     private var goalStore
    @Environment(DateStore.self)     private var dateStore

    let identifiedFood: IdentifiedFood
    let onDismiss:      () -> Void
    let onEditCustom:   ((CustomFood) -> Void)?
    let onPublishCustom: ((CustomFood) -> Void)?

    @State private var vm: FoodDetailViewModel
    @State private var showCustomizeConfirm: Bool = false

    init(identifiedFood: IdentifiedFood,
         onDismiss: @escaping () -> Void,
         onEditCustom: ((CustomFood) -> Void)? = nil,
         onPublishCustom: ((CustomFood) -> Void)? = nil) {
        self.identifiedFood  = identifiedFood
        self.onDismiss       = onDismiss
        self.onEditCustom    = onEditCustom
        self.onPublishCustom = onPublishCustom
        _vm = State(initialValue: FoodDetailViewModel(food: identifiedFood.food, mode: .add))
    }

    // Computed preview: today's logged totals + this food portion
    private var previewTotals: Macros {
        let t = logStore.totals
        let m = vm.scaledMacros
        return Macros(
            calories: t.calories + m.calories,
            proteinG: t.proteinG + m.proteinG,
            carbsG:   t.carbsG   + m.carbsG,
            fatG:     t.fatG     + m.fatG)
    }

    var body: some View {
        ZStack {
            // Main scrollable form
            ScrollView {
                VStack(spacing: Spacing.lg) {
                    macroSection
                    foodInfoSection
                    quantitySection
                    customFoodActionsSection
                    Spacer(minLength: 100)
                }
                .padding(.top, Spacing.lg)
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
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task {
            await vm.loadConversions()
            await vm.loadPreferences()
        }
    }

    // MARK: - Food Info (name + serving, shown below macro section)

    private var foodInfoSection: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack(spacing: Spacing.sm) {
                Text(identifiedFood.food.displayName)
                    .font(.appTitle2)
                    .foregroundStyle(Color.appText)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: FoodSourceIndicator.systemImage(for: identifiedFood.food.foodSource))
                    .font(.system(size: 20))
                    .foregroundStyle(FoodSourceIndicator.accentColor(for: identifiedFood.food.foodSource))
                    .accessibilityLabel(sourceAccessibilityLabel)
            }

            Text("Serving: \(Self.fmt(identifiedFood.food.baseServingSize)) \(identifiedFood.food.baseServingUnit)")
                .font(.appCaption1)
                .foregroundStyle(Color.appTextSecondary)
        }
        .padding(.horizontal, Spacing.lg)
    }

    private var sourceAccessibilityLabel: String {
        switch identifiedFood.food.foodSource {
        case .custom:    return "My food"
        case .community: return "Community food"
        case .database:  return "USDA database food"
        }
    }

    // MARK: - Macros

    private var macroSection: some View {
        let m     = vm.scaledMacros
        let goals = goalStore.goalsByDate[dateStore.selectedDate] ?? nil

        return VStack(spacing: Spacing.lg) {
            // Progress rings — day preview (today's totals + this portion)
            MacroRingProgress(
                totals:          previewTotals,
                goals:           goals,
                variant:         .default,
                showCalorieRing: true)

            // 2×2 grid — this food's macros at current quantity
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())],
                      spacing: Spacing.sm) {
                macroCell(label: "Calories", value: m.calories, unit: "kcal", color: .caloriesAccent)
                macroCell(label: "Protein",  value: m.proteinG, unit: "g",    color: .proteinAccent)
                macroCell(label: "Carbs",    value: m.carbsG,   unit: "g",    color: .carbsAccent)
                macroCell(label: "Fat",      value: m.fatG,     unit: "g",    color: .fatAccent)
            }
        }
        .padding(Spacing.lg)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
        .padding(.horizontal, Spacing.lg)
    }

    private func macroCell(label: String, value: Double, unit: String, color: Color) -> some View {
        VStack(spacing: 2) {
            Text("\(Self.fmt1(value))")
                .font(.appTitle3)
                .foregroundStyle(color)
            Text("\(unit) \(label)")
                .font(.appCaption2)
                .foregroundStyle(Color.appTextSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.sm)
        .background(color.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
    }

    // MARK: - Quantity

    private var quantitySection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Quantity")
                .font(.appHeadline)
                .foregroundStyle(Color.appText)

            HStack(spacing: Spacing.sm) {
                TextField("Amount", text: $vm.quantityText)
                    .keyboardType(.decimalPad)
                    .font(.appTitle2)
                    .padding(Spacing.md)
                    .background(Color.appSurfaceSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
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
            }

            // Manage unit conversions (custom/USDA foods)
            Button {
                vm.overlayPanel = .preview
            } label: {
                Text("Manage units")
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextSecondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, Spacing.lg)
    }


    // MARK: - Custom Food Actions

    @ViewBuilder
    private var customFoodActionsSection: some View {
        if let custom = identifiedFood.food.asCustomFood {
            HStack(spacing: Spacing.md) {
                Button {
                    onEditCustom?(custom)
                } label: {
                    Text("Edit Food")
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.appTint)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.md)
                        .background(Color.appTint.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                }
                .buttonStyle(.plain)

                Button {
                    onPublishCustom?(custom)
                } label: {
                    Text("Publish")
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.appSuccess)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.md)
                        .background(Color.appSuccess.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Spacing.lg)
        }

        if let community = identifiedFood.food.asCommunityFood {
            Button {
                showCustomizeConfirm = true
            } label: {
                Text("Customize (Save as My Food)")
                    .font(.appSubhead)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.appTint)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.md)
                    .background(Color.appTint.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, Spacing.lg)
            .confirmationDialog("Save a personal copy of this food?",
                                isPresented: $showCustomizeConfirm, titleVisibility: .visible) {
                Button("Save as My Food") { Task { await forkCommunityFood(community) } }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private func forkCommunityFood(_ food: CommunityFood) async {
        let req = CreateCustomFoodRequest(
            name:          food.name,
            brandName:     food.brandName,
            servingSize:   food.defaultServingSize,
            servingUnit:   food.defaultServingUnit,
            calories:      food.calories,
            proteinG:      food.proteinG,
            carbsG:        food.carbsG,
            fatG:          food.fatG,
            sodiumMg:      food.sodiumMg,
            cholesterolMg: food.cholesterolMg,
            fiberG:        food.fiberG,
            sugarG:        food.sugarG,
            saturatedFatG: food.saturatedFatG,
            transFatG:     food.transFatG,
            barcode:       nil)
        _ = try? await APIClient.shared.createCustomFood(req)
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

    private var saveButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            Task {
                do {
                    _ = try await vm.saveEntry(date: dateStore.selectedDate, logStore: logStore)
                    onDismiss()
                } catch {
                    // TODO: surface error
                }
            }
        } label: {
            Group {
                if vm.isSaving {
                    ProgressView().tint(.white)
                } else {
                    Text("Add to Log")
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

    private static func fmt(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(v))
            : String(format: "%.1f", v)
    }

    private static func fmt1(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(v))
            : String(format: "%.1f", v)
    }
}
