import SwiftUI

struct ExportView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var fromDate = Calendar.current.date(byAdding: .day, value: -7, to: Date())!
    @State private var toDate = Date()
    @State private var isExporting = false
    @State private var exportURL: URL? = nil
    @State private var showShare = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Date Range") {
                    DatePicker("From", selection: $fromDate, displayedComponents: .date)
                    DatePicker("To", selection: $toDate, displayedComponents: .date)
                }

                Section("Presets") {
                    Button("Last 7 days") { setPreset(days: 7) }
                    Button("Last 30 days") { setPreset(days: 30) }
                    Button("Last 90 days") { setPreset(days: 90) }
                }

                Section {
                    Button {
                        Task { await exportCSV() }
                    } label: {
                        HStack {
                            Spacer()
                            if isExporting {
                                ProgressView().tint(.white)
                            } else {
                                Label("Export CSV", systemImage: "square.and.arrow.up")
                            }
                            Spacer()
                        }
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .padding(.vertical, Spacing.sm)
                        .background(Color.appTint)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                    }
                    .buttonStyle(.plain)
                    .disabled(isExporting)
                    .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.lg,
                                             bottom: Spacing.sm, trailing: Spacing.lg))
                }
            }
            .navigationTitle("Export Data")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .sheet(isPresented: $showShare) {
                if let url = exportURL {
                    ShareSheet(items: [url])
                }
            }
        }
    }

    private func setPreset(days: Int) {
        fromDate = Calendar.current.date(byAdding: .day, value: -days, to: Date())!
        toDate = Date()
    }

    private func exportCSV() async {
        isExporting = true
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        let from = f.string(from: fromDate)
        let to = f.string(from: toDate)

        do {
            let data = try await APIClient.shared.exportEntries(from: from, to: to)
            let tmpURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("dialed-\(from)-to-\(to).csv")
            try data.write(to: tmpURL)
            exportURL = tmpURL
            showShare = true
        } catch {
            // TODO: show error
        }
        isExporting = false
    }
}

// Simple UIActivityViewController wrapper
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
