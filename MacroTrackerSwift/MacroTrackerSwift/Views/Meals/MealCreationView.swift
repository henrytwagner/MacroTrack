import SwiftUI

// MARK: - EditableMealItem (local model for the creation form)

/// Mutable local representation of a meal item during creation/editing.
/// Tracks base macros separately so quantity changes can rescale them.
private struct EditableMealItem: Identifiable {
    var id:              String
    var name:            String
    var quantity:        Double
    var quantityStr:     String
    var unit:            String
    var baseQuantity:    Double  // serving size the baseMacros are referenced against
    var baseMacros:      Macros
    var source:          FoodSource
    var usdaFdcId:       Int?
    var customFoodId:    String?
    var communityFoodId: String?

    var scaleFactor: Double { baseQuantity > 0 ? quantity / baseQuantity : 1 }

    var scaledMacros: Macros {
        let f = scaleFactor
        return Macros(calories: baseMacros.calories * f,
                      proteinG: baseMacros.proteinG * f,
                      carbsG:   baseMacros.carbsG   * f,
                      fatG:     baseMacros.fatG     * f)
    }

    var asSavedMealItem: SavedMealItem {
        let m = scaledMacros
        return SavedMealItem(
            id:              id,
            name:            name,
            quantity:        quantity,
            unit:            unit,
            calories:        m.calories,
            proteinG:        m.proteinG,
            carbsG:          m.carbsG,
            fatG:            m.fatG,
            source:          source,
            usdaFdcId:       usdaFdcId,
            customFoodId:    customFoodId,
            communityFoodId: communityFoodId)
    }

    init(from food: AnyFood) {
        id              = UUID().uuidString
        name            = food.displayName
        quantity        = food.baseServingSize
        quantityStr     = fmtQty(food.baseServingSize)
        unit            = food.baseServingUnit
        baseQuantity    = food.baseServingSize
        baseMacros      = food.baseMacros
        source          = food.foodSource
        usdaFdcId       = food.asUSDA?.fdcId
        customFoodId    = food.asCustomFood?.id
        communityFoodId = food.asCommunityFood?.id
    }

    /// Used when pre-populating from existing log entries (Save as Meal flow)
    /// or when editing a saved meal's items.
    init(from item: SavedMealItem) {
        id              = UUID().uuidString
        name            = item.name
        quantity        = item.quantity
        quantityStr     = fmtQty(item.quantity)
        unit            = item.unit
        baseQuantity    = item.quantity
        baseMacros      = item.macros
        source          = item.source
        usdaFdcId       = item.usdaFdcId
        customFoodId    = item.customFoodId
        communityFoodId = item.communityFoodId
    }
}

private func fmtQty(_ v: Double) -> String {
    v == v.rounded() ? "\(Int(v))" : String(format: "%.1f", v)
}

// MARK: - MealCreationView

/// Full-screen view for creating or editing a saved meal.
/// Pass `existingMeal` to enter edit mode (pre-populates name + items, saves via update).
/// Pass `initialItems` to pre-populate items only (e.g. from log multi-select "Save as Meal").
@MainActor
struct MealCreationView: View {
    @Environment(MealsStore.self) private var mealsStore
    @Environment(\.dismiss)       private var dismiss

    var existingMeal:  SavedMeal?        = nil
    var initialItems:  [SavedMealItem]   = []

    @State private var mealName:     String              = ""
    @State private var items:        [EditableMealItem]  = []
    @State private var showFoodSearch: Bool               = false
    @State private var isSaving:     Bool                = false
    @State private var saveError:    String?             = nil

    @FocusState private var nameFocused: Bool

    private var isEditing: Bool { existingMeal != nil }

    private var totalMacros: Macros {
        items.reduce(.zero) { acc, item in
            let m = item.scaledMacros
            return Macros(calories: acc.calories + m.calories,
                          proteinG: acc.proteinG + m.proteinG,
                          carbsG:   acc.carbsG   + m.carbsG,
                          fatG:     acc.fatG     + m.fatG)
        }
    }

    private var canSave: Bool {
        !mealName.trimmingCharacters(in: .whitespaces).isEmpty && !items.isEmpty
    }

    var body: some View {
        NavigationStack {
            List {
                // Name
                Section {
                    TextField("Meal name (e.g. Chicken Bowl)", text: $mealName)
                        .focused($nameFocused)
                        .autocorrectionDisabled()
                } header: {
                    Text("Name")
                }

                // Macro summary
                if !items.isEmpty {
                    Section("Total Macros") {
                        HStack(spacing: 0) {
                            macroCell("Calories", value: totalMacros.calories, unit: "")
                            Divider()
                            macroCell("Protein",  value: totalMacros.proteinG, unit: "g")
                            Divider()
                            macroCell("Carbs",    value: totalMacros.carbsG,   unit: "g")
                            Divider()
                            macroCell("Fat",      value: totalMacros.fatG,     unit: "g")
                        }
                        .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                    }
                }

                // Items
                Section {
                    ForEach($items) { $item in
                        itemRow(item: $item)
                    }
                    .onDelete { indices in
                        items.remove(atOffsets: indices)
                    }

                    Button {
                        showFoodSearch = true
                    } label: {
                        Label("Add Food", systemImage: "plus.circle.fill")
                            .foregroundStyle(Color.appTint)
                    }
                } header: {
                    Text("Items (\(items.count))")
                }

                if let error = saveError {
                    Section {
                        Text(error)
                            .font(.appCaption1)
                            .foregroundStyle(Color.appDestructive)
                    }
                }
            }
            .navigationTitle(isEditing ? "Edit Meal" : "New Meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView().scaleEffect(0.8)
                        } else {
                            Text("Save").fontWeight(.semibold)
                        }
                    }
                    .disabled(!canSave || isSaving)
                }
            }
            .fullScreenCover(isPresented: $showFoodSearch) {
                FoodSearchView(
                    onDismiss:        { showFoodSearch = false },
                    onAddIngredient:  { item in items.append(EditableMealItem(from: item)) })
                .environment(mealsStore)
            }
        }
        .onAppear {
            if let meal = existingMeal {
                mealName = meal.name
                items    = meal.items.map { EditableMealItem(from: $0) }
            } else {
                items = initialItems.map { EditableMealItem(from: $0) }
                if initialItems.isEmpty { nameFocused = true }
            }
        }
    }

    // MARK: - Item Row

    @ViewBuilder
    private func itemRow(item: Binding<EditableMealItem>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: Spacing.md) {
                Text(item.wrappedValue.name)
                    .font(.appSubhead)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                Spacer()

                HStack(spacing: Spacing.xs) {
                    TextField("Qty", text: item.quantityStr)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 52)
                        .onChange(of: item.wrappedValue.quantityStr) { _, newStr in
                            if let v = Double(newStr), v > 0 {
                                item.quantity.wrappedValue = v
                            }
                        }
                    Text(item.wrappedValue.unit)
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextSecondary)
                }
            }

            let m = item.wrappedValue.scaledMacros
            HStack(spacing: 6) {
                Text("\(Int(m.calories.rounded())) cal")
                    .foregroundStyle(Color.appTextSecondary)
                Text("·").foregroundStyle(Color.appTextTertiary)
                Text("P \(Int(m.proteinG.rounded()))g")
                    .foregroundStyle(Color.proteinAccent)
                Text("C \(Int(m.carbsG.rounded()))g")
                    .foregroundStyle(Color.carbsAccent)
                Text("F \(Int(m.fatG.rounded()))g")
                    .foregroundStyle(Color.fatAccent)
            }
            .font(.appCaption1)
        }
        .padding(.vertical, Spacing.xs)
    }

    // MARK: - Macro Cell

    @ViewBuilder
    private func macroCell(_ label: String, value: Double, unit: String) -> some View {
        VStack(spacing: 2) {
            Text("\(Int(value.rounded()))\(unit)")
                .font(.appSubhead).fontWeight(.semibold)
                .foregroundStyle(Color.appText)
            Text(label)
                .font(.appCaption2)
                .foregroundStyle(Color.appTextSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.xs)
    }

    // MARK: - Save

    private func save() async {
        let name = mealName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, !items.isEmpty else { return }
        isSaving  = true
        saveError = nil
        do {
            if let existing = existingMeal {
                try await mealsStore.update(id: existing.id, name: name, items: items.map(\.asSavedMealItem))
            } else {
                try await mealsStore.create(name: name, items: items.map(\.asSavedMealItem))
            }
            dismiss()
        } catch {
            saveError = "Failed to save meal. Please try again."
            isSaving  = false
        }
    }
}
