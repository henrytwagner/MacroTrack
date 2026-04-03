import SwiftUI

struct LogWeightSheet: View {
    @Environment(WeightStore.self) private var weightStore
    @Environment(ProfileStore.self) private var profileStore
    @Environment(ProgressPhotoStore.self) private var progressPhotoStore
    @Environment(\.dismiss) private var dismiss

    @State private var selectedDate = Date()
    @State private var weightText = ""
    @State private var noteText = ""
    @State private var isSaving = false
    @State private var savedEntry: WeightEntry?
    @State private var showProgressCamera = false

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

                // Post-save: offer progress photo
                if let entry = savedEntry {
                    Section {
                        Button {
                            showProgressCamera = true
                        } label: {
                            Label("Take Progress Photo", systemImage: "camera.fill")
                                .font(.appBody)
                        }

                        Button("Done") { dismiss() }
                            .font(.appBody)
                            .foregroundStyle(Color.appTextSecondary)
                    } header: {
                        Text("Weight saved (\(formatWeight(entry.weightKg)))")
                    }
                }
            }
            .navigationTitle("Log Weight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if savedEntry == nil {
                        Button("Save") { Task { await save() } }
                            .disabled(weightValue == nil || isSaving)
                            .fontWeight(.semibold)
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear {
            // Pre-fill with latest weight
            if let latest = weightStore.latestWeight {
                let display = isMetric ? latest : latest * 2.20462
                weightText = String(format: "%.1f", display)
            }
        }
        .fullScreenCover(isPresented: $showProgressCamera) {
            ProgressCameraView(linkedWeightEntryId: savedEntry?.id)
                .environment(progressPhotoStore)
                .environment(weightStore)
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
            let entry = try await weightStore.log(date: dateStr, weightKg: kg,
                                                   note: noteText.isEmpty ? nil : noteText)
            savedEntry = entry
        } catch {
            // Stay on sheet
        }
        isSaving = false
    }

    private func formatWeight(_ kg: Double) -> String {
        let value = isMetric ? kg : kg * 2.20462
        let unit = isMetric ? "kg" : "lbs"
        return String(format: "%.1f %@", value, unit)
    }
}
