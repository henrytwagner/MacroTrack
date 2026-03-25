import SwiftUI

// MARK: - LogMealSheet

/// Sheet for logging a saved meal — portion stepper, macro preview, read-only item list.
/// Tapping "Edit" opens MealCreationView to modify the template.
@MainActor
struct LogMealSheet: View {
    @Environment(MealsStore.self)    private var mealsStore
    @Environment(DailyLogStore.self) private var logStore
    @Environment(DateStore.self)     private var dateStore
    @Environment(\.dismiss)          private var dismiss

    let meal:     SavedMeal
    /// Called after meal is successfully logged.
    let onLogged: () -> Void

    @State private var scaleFactor:  Double  = 1.0
    @State private var isLogging:    Bool    = false
    @State private var errorMessage: String? = nil
    @State private var showEdit:     Bool    = false

    private let step: Double = 0.25
    private let min:  Double = 0.25
    private let max:  Double = 3.0

    /// Live meal data — re-reads from store so edits reflect immediately.
    private var liveMeal: SavedMeal {
        mealsStore.meal(for: meal.id) ?? meal
    }

    private var scaled: Macros {
        let b = liveMeal.totalMacros
        return Macros(calories: b.calories * scaleFactor,
                      proteinG: b.proteinG * scaleFactor,
                      carbsG:   b.carbsG   * scaleFactor,
                      fatG:     b.fatG     * scaleFactor)
    }

    var body: some View {
        NavigationStack {
            List {
                // Portion stepper
                Section("Portion") {
                    HStack(spacing: Spacing.lg) {
                        stepperButton(systemImage: "minus.circle.fill", enabled: scaleFactor > min) {
                            scaleFactor = ((scaleFactor - step) * 100).rounded() / 100
                        }
                        Spacer()
                        VStack(spacing: 2) {
                            Text(scaleLabel)
                                .font(.system(size: 28, weight: .semibold, design: .rounded))
                                .foregroundStyle(Color.appText)
                            Text(scaleFactor == 1 ? "serving" : "servings")
                                .font(.appCaption1)
                                .foregroundStyle(Color.appTextSecondary)
                        }
                        Spacer()
                        stepperButton(systemImage: "plus.circle.fill", enabled: scaleFactor < max) {
                            scaleFactor = ((scaleFactor + step) * 100).rounded() / 100
                        }
                    }
                    .padding(.vertical, Spacing.xs)
                }

                // Macro preview
                Section("Macros") {
                    HStack(spacing: 0) {
                        macroCell("Calories", value: scaled.calories, unit: "")
                        Divider()
                        macroCell("Protein",  value: scaled.proteinG, unit: "g")
                        Divider()
                        macroCell("Carbs",    value: scaled.carbsG,   unit: "g")
                        Divider()
                        macroCell("Fat",      value: scaled.fatG,     unit: "g")
                    }
                    .padding(.vertical, Spacing.xs)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                }

                // Items
                Section("Items (\(liveMeal.items.count))") {
                    ForEach(liveMeal.items) { item in
                        itemRow(item, scaleFactor: scaleFactor)
                    }
                }

                if let error = errorMessage {
                    Section {
                        Text(error)
                            .font(.appCaption1)
                            .foregroundStyle(Color.appDestructive)
                    }
                }
            }
            .navigationTitle(liveMeal.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Edit") { showEdit = true }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await doLog() }
                    } label: {
                        if isLogging {
                            ProgressView().scaleEffect(0.8)
                        } else {
                            Text("Add to Log").fontWeight(.semibold)
                        }
                    }
                    .disabled(isLogging)
                }
            }
            .fullScreenCover(isPresented: $showEdit) {
                MealCreationView(existingMeal: liveMeal)
                    .environment(mealsStore)
            }
        }
    }

    // MARK: - Item Row

    @ViewBuilder
    private func itemRow(_ item: SavedMealItem, scaleFactor: Double) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(.appSubhead)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                MacroInlineLine(
                    prefix: "\(fmtScaledQty(item.quantity, scaleFactor)) \(item.unit)",
                    macros: Macros(
                        calories: item.calories * scaleFactor,
                        proteinG: item.proteinG * scaleFactor,
                        carbsG:   item.carbsG   * scaleFactor,
                        fatG:     item.fatG     * scaleFactor
                    )
                )
            }

            Spacer()

            Image(systemName: FoodSourceIndicator.systemImage(for: item.source))
                .font(.system(size: 16))
                .foregroundStyle(FoodSourceIndicator.accentColor(for: item.source))
        }
        .padding(.vertical, Spacing.xs)
    }

    // MARK: - Helpers

    private var scaleLabel: String {
        let v = scaleFactor
        if v == v.rounded() { return "\(Int(v))" }
        return String(format: "%.2g", v)
    }

    private func fmtScaledQty(_ qty: Double, _ factor: Double) -> String {
        let v = qty * factor
        return v.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(v))" : String(format: "%.1f", v)
    }

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
    }

    private func stepperButton(systemImage: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 32))
                .foregroundStyle(enabled ? Color.appTint : Color.appTextTertiary)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    // MARK: - Log Action

    private func doLog() async {
        isLogging    = true
        errorMessage = nil
        do {
            let entries = try await mealsStore.logMeal(
                savedMealId: liveMeal.id,
                date:        dateStore.selectedDate,
                mealLabel:   currentMealLabel(),
                scaleFactor: scaleFactor)
            for entry in entries { logStore.addEntry(entry) }
            dismiss()
            onLogged()
        } catch {
            errorMessage = "Failed to log meal. Please try again."
            isLogging    = false
        }
    }
}
