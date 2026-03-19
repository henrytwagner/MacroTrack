import SwiftUI

// MARK: - GoalsEditView

/// Manual goal entry screen — pre-fills from GoalStore and saves on tap.
struct GoalsEditView: View {
    @Environment(GoalStore.self)   private var goalStore
    @Environment(DateStore.self)   private var dateStore
    @Environment(\.dismiss)        private var dismiss

    @State private var calories: String = ""
    @State private var protein:  String = ""
    @State private var carbs:    String = ""
    @State private var fat:      String = ""
    @State private var isSaving: Bool = false

    private var selectedDate: String { dateStore.selectedDate }
    private var goals: DailyGoal? { goalStore.goalsByDate[selectedDate] ?? nil }

    // At least one field is non-zero
    private var canSave: Bool {
        (Double(calories) ?? 0) > 0 || (Double(protein) ?? 0) > 0
            || (Double(carbs) ?? 0) > 0 || (Double(fat) ?? 0) > 0
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                // Goal input fields
                VStack(spacing: Spacing.md) {
                    goalField(label: "Calories", placeholder: "e.g. 2000",
                              value: $calories, unit: "kcal", accentColor: .caloriesAccent)
                    Divider().padding(.leading, Spacing.lg)
                    goalField(label: "Protein",  placeholder: "e.g. 150",
                              value: $protein,  unit: "g", accentColor: .proteinAccent)
                    Divider().padding(.leading, Spacing.lg)
                    goalField(label: "Carbs",    placeholder: "e.g. 200",
                              value: $carbs,    unit: "g", accentColor: .carbsAccent)
                    Divider().padding(.leading, Spacing.lg)
                    goalField(label: "Fat",      placeholder: "e.g. 65",
                              value: $fat,      unit: "g", accentColor: .fatAccent)
                }
                .background(Color.appSurface)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))

                // Save button
                Button {
                    Task { await save() }
                } label: {
                    Group {
                        if isSaving {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Save Goals")
                                .font(.appSubhead)
                                .fontWeight(.semibold)
                        }
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.md)
                    .background(canSave ? Color.appTint : Color.appTextTertiary)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .disabled(!canSave || isSaving)
            }
            .padding(Spacing.lg)
            .padding(.top, Spacing.sm)
        }
        .background(Color.appBackground)
        .navigationTitle("Set Targets")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await goalStore.fetch(date: selectedDate)
        }
        .onChange(of: goals?.id) { _, _ in
            prefillFromGoals()
        }
        .onAppear {
            prefillFromGoals()
        }
    }

    // MARK: Field builder

    @ViewBuilder
    private func goalField(
        label: String,
        placeholder: String,
        value: Binding<String>,
        unit: String,
        accentColor: Color
    ) -> some View {
        HStack(spacing: Spacing.md) {
            Circle()
                .fill(accentColor.opacity(0.2))
                .frame(width: 10, height: 10)

            Text(label)
                .font(.appBody)
                .foregroundStyle(Color.appText)
                .frame(width: 80, alignment: .leading)

            TextField(placeholder, text: value)
                .keyboardType(.decimalPad)
                .font(.appBody)
                .multilineTextAlignment(.trailing)
                .foregroundStyle(Color.appText)

            Text(unit)
                .font(.appFootnote)
                .foregroundStyle(Color.appTextTertiary)
                .frame(width: 32, alignment: .trailing)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
    }

    // MARK: Actions

    private func prefillFromGoals() {
        guard let g = goals else { return }
        calories = String(Int(g.calories))
        protein  = String(Int(g.proteinG))
        carbs    = String(Int(g.carbsG))
        fat      = String(Int(g.fatG))
    }

    private func save() async {
        let cal = Double(calories) ?? 0
        let pro = Double(protein)  ?? 0
        let car = Double(carbs)    ?? 0
        let f   = Double(fat)      ?? 0
        guard cal > 0 || pro > 0 || car > 0 || f > 0 else { return }

        isSaving = true
        await goalStore.saveChange(data: UpdateGoalsForDateRequest(
            effectiveDate:  selectedDate,
            macros:         Macros(calories: cal, proteinG: pro, carbsG: car, fatG: f),
            goalType:       .maintain,
            aggressiveness: .standard))
        isSaving = false
        dismiss()
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        GoalsEditView()
            .environment(GoalStore.shared)
            .environment(DateStore.shared)
    }
}
