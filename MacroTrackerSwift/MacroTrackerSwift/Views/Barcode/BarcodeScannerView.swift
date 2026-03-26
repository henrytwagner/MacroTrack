import SwiftUI
import VisionKit

// MARK: - BarcodeScannerView

/// VisionKit DataScannerViewController wrapper.
/// iOS 16+ only; project targets iOS 17+ so no availability check needed.
struct BarcodeScannerView: UIViewControllerRepresentable {

    // Plain function types — no @MainActor annotation. The coordinator is @MainActor
    // and dispatches back to main actor internally, avoiding Sendable conversion issues.
    let onScanned: (String) -> Void
    let onDismiss: () -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(
            recognizedDataTypes: [.barcode()],
            qualityLevel: .balanced,
            isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        try? vc.startScanning()
        return vc
    }

    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onScanned: onScanned, onDismiss: onDismiss)
    }

    // MARK: - Coordinator

    @MainActor
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let onScanned: (String) -> Void
        private let onDismiss: () -> Void
        private var hasScanned = false

        init(onScanned: @escaping (String) -> Void,
             onDismiss: @escaping () -> Void) {
            self.onScanned = onScanned
            self.onDismiss = onDismiss
        }

        // nonisolated because NSObject delegate dispatch doesn't know about actor isolation.
        // VisionKit calls this on the main thread, so the Task {@MainActor} hop is safe
        // and preserves the single-fire guarantee.
        nonisolated func dataScanner(_ dataScanner: DataScannerViewController,
                                     didTapOn item: RecognizedItem) {
            guard case .barcode(let barcode) = item,
                  let payload = barcode.payloadStringValue else { return }
            Task { @MainActor [weak self] in
                guard let self, !self.hasScanned else { return }
                self.hasScanned = true
                self.onScanned(payload)
            }
        }

        // Auto-fire on recognition with 300ms stability debounce.
        nonisolated func dataScanner(_ dataScanner: DataScannerViewController,
                                     didAdd addedItems: [RecognizedItem],
                                     allItems: [RecognizedItem]) {
            guard case .barcode(let barcode) = addedItems.first,
                  let payload = barcode.payloadStringValue else { return }
            Task { @MainActor [weak self] in
                guard let self, !self.hasScanned else { return }
                try? await Task.sleep(nanoseconds: 300_000_000)
                guard !self.hasScanned else { return }
                self.hasScanned = true
                self.onScanned(payload)
            }
        }
    }
}
