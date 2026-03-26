import SwiftUI
import UIKit

// MARK: - BarcodeScannerOverlay

/// Full-screen barcode scanner using the shared AVFoundation camera engine.
/// Replaces VisionKit-based BarcodeScannerScreen with a unified scanner
/// that uses `KitchenCameraSession` + `AVCaptureMetadataOutput` for
/// hardware-accelerated barcode detection (including small barcodes).
///
/// All detected barcodes are normalized to GTIN-13 via `GTINNormalizer`
/// before calling `onScanned`.
///
/// UI: camera preview fills the screen, with bottom overlay controls
/// (close button, "Type it in" manual entry panel).
@MainActor
struct BarcodeScannerOverlay: View {
    let onScanned: (String) -> Void
    let onDismiss: () -> Void

    @State private var isManualEntry = false
    @State private var manualText    = ""
    @State private var keyboardInset: CGFloat = 0
    @State private var hasScanned    = false
    @FocusState private var fieldFocused: Bool

    private let camera = KitchenCameraSession.shared

    var body: some View {
        ZStack {
            // Camera preview fills entire screen
            KitchenCameraPreview(session: camera.captureSession)
                .ignoresSafeArea()

            VStack {
                Spacer()
                bottomChrome
            }
            .padding(.bottom, keyboardInset)
        }
        .ignoresSafeArea()
        .animation(.easeOut(duration: 0.25), value: keyboardInset)
        .task {
            // Request permission and start camera
            let granted = await camera.requestPermission()
            guard granted else { return }

            camera.onBarcodeDetected = { [self] gtin in
                guard !hasScanned else { return }
                hasScanned = true
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                onScanned(gtin)
            }
            camera.start()
        }
        .onDisappear {
            camera.onBarcodeDetected = nil
            camera.stop()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { notification in
            guard
                let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
                let window = UIApplication.shared.connectedScenes
                    .compactMap({ $0 as? UIWindowScene })
                    .flatMap(\.windows)
                    .first(where: \.isKeyWindow)
            else { return }
            let screenBounds = window.screen.bounds
            let overlap = max(0, screenBounds.maxY - frame.minY)
            keyboardInset = overlap
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardInset = 0
        }
    }

    // MARK: - Bottom Chrome

    private var bottomChrome: some View {
        VStack(spacing: Spacing.md) {
            HStack {
                closeButton
                Spacer()
            }

            if isManualEntry {
                manualEntryPanel
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
                VStack(spacing: Spacing.md) {
                    Text("Point at a barcode")
                        .font(.appSubhead)
                        .foregroundStyle(.white.opacity(0.85))

                    Button {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            isManualEntry = true
                        }
                    } label: {
                        Text("Type it in")
                            .font(.appSubhead)
                            .fontWeight(.semibold)
                            .foregroundStyle(.white)
                            .padding(.horizontal, Spacing.lg)
                            .padding(.vertical, Spacing.sm)
                            .background(.ultraThinMaterial)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
                .transition(.opacity)
            }
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, isManualEntry ? Spacing.lg : Spacing.xxxl + Spacing.xxl)
    }

    private var closeButton: some View {
        Button {
            onDismiss()
        } label: {
            Image(systemName: "xmark")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Manual Entry Panel

    private var manualEntryPanel: some View {
        VStack(spacing: Spacing.md) {
            Text("Enter barcode manually")
                .font(.appSubhead)
                .fontWeight(.semibold)
                .foregroundStyle(Color.appText)

            HStack(spacing: Spacing.md) {
                TextField("000000000000", text: $manualText)
                    .keyboardType(.numberPad)
                    .focused($fieldFocused)
                    .font(.appBody)
                    .padding(Spacing.md)
                    .background(Color.appSurfaceSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                    .frame(maxWidth: .infinity)

                Button {
                    let trimmed = manualText.trimmingCharacters(in: .whitespaces)
                    guard !trimmed.isEmpty else { return }
                    onScanned(GTINNormalizer.normalizeToGTIN(trimmed))
                } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 48, height: 48)
                        .background(manualText.isEmpty ? Color.appBorder : Color.appTint)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                }
                .buttonStyle(.plain)
                .disabled(manualText.isEmpty)
            }

            Button {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    fieldFocused = false
                    isManualEntry = false
                    manualText    = ""
                }
            } label: {
                Text("Cancel")
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTextSecondary)
            }
            .buttonStyle(.plain)
        }
        .padding(Spacing.lg)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        .onAppear { fieldFocused = true }
    }
}
