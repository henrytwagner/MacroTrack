import SwiftUI
import UIKit

// MARK: - EditEntrySheet

/// Quick-edit sheet for a logged food entry. Ratio-based scaling — no food lookup needed.
@MainActor
struct EditEntrySheet: View {
    @Environment(DailyLogStore.self) private var logStore

    let entry:     FoodEntry
    let onDismiss: () -> Void

    @State private var quantityText: String = ""
    @State private var selectedUnit: String = ""
    @State private var isSaving:     Bool   = false
    @State private var showDeleteConfirm: Bool = false

    private var quantity: Double { Double(quantityText) ?? 0 }

    /// Ratio-based macro scaling: stored entry macros × (newQty / entry.quantity)
    private var scaledMacros: Macros {
        guard entry.quantity > 0, quantity > 0 else { return entryMacros }
        let ratio = quantity / entry.quantity
        return Macros(
            calories: round1(entryMacros.calories * ratio),
            proteinG: round1(entryMacros.proteinG * ratio),
            carbsG:   round1(entryMacros.carbsG   * ratio),
            fatG:     round1(entryMacros.fatG      * ratio))
    }

    private var entryMacros: Macros {
        Macros(calories: entry.calories, proteinG: entry.proteinG,
               carbsG: entry.carbsG, fatG: entry.fatG)
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            VStack(spacing: Spacing.lg) {
                // Header
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text(entry.name)
                        .font(.appTitle2)
                        .foregroundStyle(Color.appText)
                    MacroInlineLine(
                        prefix: "\(fmt(quantity)) \(selectedUnit)",
                        macros: scaledMacros)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Spacing.lg)
                .padding(.top, Spacing.sm)

                // Macro summary card
                HStack(spacing: Spacing.xl) {
                    macroValue(label: "Cal",     value: scaledMacros.calories, color: .caloriesAccent, unit: "")
                    macroValue(label: "Protein", value: scaledMacros.proteinG, color: .proteinAccent,  unit: "g")
                    macroValue(label: "Carbs",   value: scaledMacros.carbsG,   color: .carbsAccent,    unit: "g")
                    macroValue(label: "Fat",     value: scaledMacros.fatG,     color: .fatAccent,      unit: "g")
                }
                .padding(Spacing.lg)
                .frame(maxWidth: .infinity)
                .background(Color.appSurface)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                .padding(.horizontal, Spacing.lg)

                // Quantity field
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text("Quantity")
                        .font(.appHeadline)
                        .foregroundStyle(Color.appText)
                    TextField("Amount", text: $quantityText)
                        .keyboardType(.decimalPad)
                        .font(.appTitle2)
                        .padding(Spacing.md)
                        .background(Color.appSurfaceSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                }
                .padding(.horizontal, Spacing.lg)

                // Unit pills
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    Text("Unit")
                        .font(.appHeadline)
                        .foregroundStyle(Color.appText)
                        .padding(.horizontal, Spacing.lg)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Spacing.sm) {
                            ForEach(allServingUnits, id: \.self) { unit in
                                Button {
                                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                    selectedUnit = unit
                                } label: {
                                    Text(unit)
                                        .font(.appCaption1)
                                        .fontWeight(selectedUnit == unit ? .semibold : .regular)
                                        .foregroundStyle(selectedUnit == unit ? .white : Color.appText)
                                        .padding(.horizontal, Spacing.md)
                                        .padding(.vertical, Spacing.xs + 2)
                                        .background(selectedUnit == unit ? Color.appTint : Color.appSurfaceSecondary)
                                        .clipShape(Capsule())
                                        .overlay(Capsule()
                                            .stroke(selectedUnit == unit ? Color.clear : Color.appBorder,
                                                    lineWidth: 0.5))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, Spacing.lg)
                        .padding(.vertical, Spacing.xs)
                    }
                }

                Spacer()

                // Delete button
                Button(role: .destructive) {
                    showDeleteConfirm = true
                } label: {
                    Label("Delete Entry", systemImage: "trash")
                        .font(.appSubhead)
                        .foregroundStyle(Color.appDestructive)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.md)
                        .background(Color.appDestructive.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, Spacing.lg)
                .confirmationDialog("Delete \"\(entry.name)\"?",
                                    isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                    Button("Delete", role: .destructive) { handleDelete() }
                    Button("Cancel", role: .cancel) {}
                }
            }
            .navigationTitle("Edit Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { onDismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await handleSave() }
                    } label: {
                        if isSaving {
                            ProgressView().tint(Color.appTint)
                        } else {
                            Text("Save")
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(quantity <= 0 || isSaving)
                }
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .onAppear {
            quantityText = fmt(entry.quantity)
            selectedUnit = entry.unit
        }
    }

    // MARK: - Helpers

    private func macroValue(label: String, value: Double, color: Color, unit: String) -> some View {
        VStack(spacing: 2) {
            Text("\(Int(value.rounded()))\(unit)")
                .font(.appHeadline)
                .foregroundStyle(color)
            Text(label)
                .font(.appCaption2)
                .foregroundStyle(Color.appTextSecondary)
        }
    }

    private func handleSave() async {
        isSaving = true
        defer { isSaving = false }
        let m   = scaledMacros
        let req = UpdateFoodEntryRequest(
            quantity: quantity,
            unit:     selectedUnit,
            calories: m.calories,
            proteinG: m.proteinG,
            carbsG:   m.carbsG,
            fatG:     m.fatG)
        do {
            let updated = try await APIClient.shared.updateEntry(id: entry.id, data: req)
            if let idx = logStore.entries.firstIndex(where: { $0.id == entry.id }) {
                logStore.entries[idx] = updated
            }
            onDismiss()
        } catch {
            // TODO: surface error
        }
    }

    private func handleDelete() {
        logStore.removeEntry(id: entry.id)
        Task { try? await logStore.commitDelete(id: entry.id) }
        onDismiss()
    }

    private func fmt(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(v))
            : String(format: "%.1f", v)
    }

    private func round1(_ v: Double) -> Double {
        (v * 10).rounded() / 10
    }
}
