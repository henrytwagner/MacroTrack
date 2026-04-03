import SwiftUI
import UIKit

// MARK: - LabelCameraOverlay

/// Full-screen camera overlay for capturing a nutrition label photo.
/// Captures a still image, runs on-device Vision OCR, sends to Gemini for
/// structuring, then calls `onScanned` with the normalized result.
@MainActor
struct LabelCameraOverlay: View {
    /// Called with the normalized label on success. Caller uses this to prefill the form.
    let onScanned: (ParsedNutritionLabel) -> Void
    let onDismiss: () -> Void

    @State private var isScanning = false
    @State private var errorMessage: String? = nil

    private let camera = KitchenCameraSession.shared

    var body: some View {
        ZStack {
            KitchenCameraPreview(session: camera.captureSession)
                .ignoresSafeArea()

            // Viewfinder guide rectangle
            RoundedRectangle(cornerRadius: BorderRadius.md)
                .strokeBorder(.white.opacity(0.6), lineWidth: 1.5)
                .frame(maxWidth: .infinity)
                .frame(height: 200)
                .padding(.horizontal, Spacing.xxxl)

            VStack {
                Spacer()
                bottomChrome
            }
        }
        .ignoresSafeArea()
        .task {
            let granted = await camera.requestPermission()
            guard granted else { onDismiss(); return }
            camera.start()
        }
        .onDisappear {
            camera.stop()
        }
    }

    // MARK: - Bottom Chrome

    private var bottomChrome: some View {
        VStack(spacing: Spacing.md) {
            HStack {
                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(.ultraThinMaterial)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)

                Spacer()
            }

            if let error = errorMessage {
                Text(error)
                    .font(.appCaption1)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Spacing.lg)
            }

            Text("Aim at the Nutrition Facts panel")
                .font(.appSubhead)
                .foregroundStyle(.white.opacity(0.85))

            shutterButton
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.xxxl + Spacing.xxl)
    }

    private var shutterButton: some View {
        Button {
            Task { await captureAndScan() }
        } label: {
            ZStack {
                Circle()
                    .strokeBorder(.white, lineWidth: 3)
                    .frame(width: 72, height: 72)
                Circle()
                    .fill(isScanning ? Color.white.opacity(0.5) : Color.white)
                    .frame(width: 60, height: 60)
                if isScanning {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(Color.appTint)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(isScanning)
    }

    // MARK: - Capture + Scan Pipeline

    private func captureAndScan() async {
        guard !isScanning else { return }
        isScanning = true
        errorMessage = nil
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()

        defer { isScanning = false }

        guard let image = await camera.capturePhoto(),
              let cgImage = image.cgImage else {
            errorMessage = "Couldn't capture photo. Try again."
            return
        }

        do {
            let ocrText = try await NutritionLabelScanner.recognizeText(from: cgImage)
            guard !ocrText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                errorMessage = "No text found. Make sure the label is in frame."
                return
            }
            let response = try await APIClient.shared.parseNutritionLabel(ocrText: ocrText)
            let parsed = NutritionLabelParser.normalize(response)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            onScanned(parsed)
        } catch {
            errorMessage = "Scan failed. Check your connection and try again."
        }
    }
}
