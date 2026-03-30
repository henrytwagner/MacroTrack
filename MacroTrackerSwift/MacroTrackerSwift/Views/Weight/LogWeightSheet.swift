import SwiftUI

struct LogWeightSheet: View {
    @Environment(WeightStore.self) private var weightStore
    @Environment(ProfileStore.self) private var profileStore
    @Environment(\.dismiss) private var dismiss

    @State private var selectedDate = Date()
    @State private var weightText = ""
    @State private var noteText = ""
    @State private var isSaving = false

    private var isMetric: Bool {
        profileStore.profile?.preferredUnits != .imperial
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Date") {
                    DatePicker("Date", selection: $selectedDate, displayedComponents: .date)
                        .datePickerStyle(.compact)
                }

                Section(isMetric ? "Weight (kg)" : "Weight (lbs)") {
                    TextField(isMetric ? "e.g. 70.5" : "e.g. 155.0", text: $weightText)
                        .keyboardType(.decimalPad)
                }

                Section("Note (optional)") {
                    TextField("e.g. Morning weigh-in", text: $noteText)
                }
            }
            .navigationTitle("Log Weight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(weightValue == nil || isSaving)
                        .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium])
        .onAppear {
            // Pre-fill with latest weight
            if let latest = weightStore.latestWeight {
                let display = isMetric ? latest : latest * 2.20462
                weightText = String(format: "%.1f", display)
            }
        }
    }

    private var weightValue: Double? {
        guard let val = Double(weightText), val > 0 else { return nil }
        return isMetric ? val : val / 2.20462  // convert lbs to kg
    }

    private func save() async {
        guard let kg = weightValue else { return }
        isSaving = true

        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        let dateStr = f.string(from: selectedDate)

        do {
            try await weightStore.log(date: dateStr, weightKg: kg,
                                       note: noteText.isEmpty ? nil : noteText)
            dismiss()
        } catch {
            // Stay on sheet
        }
        isSaving = false
    }
}
