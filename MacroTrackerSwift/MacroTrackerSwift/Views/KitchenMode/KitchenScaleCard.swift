import SwiftUI

/// Compact card showing BLE scale connection status and live weight reading.
/// Port of mobile/features/scale/KitchenScaleCard.tsx.
struct KitchenScaleCard: View {
    let connectionState: ScaleConnectionState
    let reading: ScaleReading?
    var onConnect: () -> Void = {}
    var onDisconnect: () -> Void = {}
    var onCancelScan: () -> Void = {}
    var onSimulate: () -> Void = {}

    var body: some View {
        Group {
            switch connectionState {
            case .idle, .error:
                idleOrErrorContent
            case .scanning:
                scanningContent
            case .connecting:
                connectingContent
            case .connected:
                if let reading {
                    readingContent(reading)
                } else {
                    waitingContent
                }
            }
        }
        .padding(Spacing.lg)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        .overlay(
            RoundedRectangle(cornerRadius: BorderRadius.lg)
                .strokeBorder(Color.appBorder, lineWidth: 0.5)
        )
    }

    // MARK: - Idle / Error

    private var idleOrErrorContent: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "scalemass")
                .font(.system(size: 20))
                .foregroundStyle(Color.appTextSecondary)

            VStack(alignment: .leading, spacing: Spacing.xs) {
                Button(action: onConnect) {
                    Text("Connect to Scale")
                        .font(.appFootnote)
                        .tracking(Typography.Tracking.footnote)
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .padding(.horizontal, Spacing.lg)
                        .padding(.vertical, Spacing.xs)
                        .background(Color.appTint)
                        .clipShape(Capsule())
                }

                if case .error(let message) = connectionState {
                    Text(message)
                        .font(.appCaption1)
                        .tracking(Typography.Tracking.caption1)
                        .foregroundStyle(Color.appDestructive)
                }
            }

            Spacer()

            #if DEBUG
            Button("Simulate", action: onSimulate)
                .font(.appCaption1)
                .tracking(Typography.Tracking.caption1)
                .foregroundStyle(Color.appTextTertiary)
            #endif
        }
    }

    // MARK: - Scanning

    private var scanningContent: some View {
        HStack(spacing: Spacing.sm) {
            ProgressView()
                .tint(Color.appTint)

            Text("Scanning for scale\u{2026}")
                .font(.appFootnote)
                .tracking(Typography.Tracking.footnote)
                .foregroundStyle(Color.appTextSecondary)

            Spacer()

            Button("Cancel", action: onCancelScan)
                .font(.appCaption1)
                .tracking(Typography.Tracking.caption1)
                .foregroundStyle(Color.appTextTertiary)
        }
    }

    // MARK: - Connecting

    private var connectingContent: some View {
        HStack(spacing: Spacing.sm) {
            ProgressView()
                .tint(Color.appTint)

            Text("Connecting\u{2026}")
                .font(.appFootnote)
                .tracking(Typography.Tracking.footnote)
                .foregroundStyle(Color.appTextSecondary)
        }
    }

    // MARK: - Waiting (connected, no reading)

    private var waitingContent: some View {
        HStack(spacing: Spacing.sm) {
            ProgressView()
                .tint(Color.appTint)

            Text("Waiting for scale\u{2026}")
                .font(.appFootnote)
                .tracking(Typography.Tracking.footnote)
                .foregroundStyle(Color.appTextSecondary)

            Spacer()

            Button("Disconnect", action: onDisconnect)
                .font(.appCaption1)
                .tracking(Typography.Tracking.caption1)
                .foregroundStyle(Color.appTextTertiary)
        }
    }

    // MARK: - Reading

    private func readingContent(_ reading: ScaleReading) -> some View {
        HStack(spacing: Spacing.md) {
            HStack(spacing: Spacing.sm) {
                // Stable / Measuring badge
                Text(reading.stable ? "Stable" : "Measuring\u{2026}")
                    .font(.appCaption1)
                    .tracking(Typography.Tracking.caption1)
                    .fontWeight(.semibold)
                    .foregroundStyle(reading.stable ? Color.appSuccess : Color.appTextSecondary)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, 2)
                    .background(
                        (reading.stable ? Color.appSuccess : Color.appTextSecondary)
                            .opacity(0.12)
                    )
                    .clipShape(Capsule())

                // Large weight display
                Text(reading.display)
                    .font(.system(size: 28, weight: .bold))
                    .tracking(-0.5)
                    .foregroundStyle(reading.stable ? Color.appTint : Color.appText)
            }

            Spacer()

            Button("Disconnect", action: onDisconnect)
                .font(.appCaption1)
                .tracking(Typography.Tracking.caption1)
                .foregroundStyle(Color.appTextTertiary)
        }
    }
}
