import SwiftUI

/// Compact card showing BLE scale connection status and live weight reading.
/// Port of mobile/features/scale/KitchenScaleCard.tsx.
struct KitchenScaleCard: View {
    let connectionState: ScaleConnectionState
    let reading: ScaleReading?
    var showConnectedBanner: Bool = false
    var onConnect: () -> Void = {}
    var onDisconnect: () -> Void = {}
    var onCancelScan: () -> Void = {}
    var onSimulate: () -> Void = {}

    var body: some View {
        Group {
            switch connectionState {
            case .idle:
                idleContent
            case .error:
                errorBanner
            case .scanning:
                scanningContent
            case .connecting:
                connectingContent
            case .connected:
                if showConnectedBanner {
                    connectedBanner
                } else if let reading {
                    readingContent(reading)
                } else {
                    waitingContent
                }
            }
        }
        .glassCard(isHero: false)
    }

    // MARK: - Idle

    private var idleContent: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "scalemass")
                .font(.system(size: 20))
                .foregroundStyle(Color.appTextSecondary)

            Button(action: onConnect) {
                Text("Connect to Scale")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.vertical, Spacing.xs)
                    .background(Color.appTint)
                    .clipShape(Capsule())
            }

            Spacer()

            #if DEBUG
            Button("Simulate", action: onSimulate)
                .font(.system(size: 12))
                .foregroundStyle(Color.appTextTertiary)
            #endif
        }
    }

    // MARK: - Error Banner

    private var errorBanner: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 14))
                .foregroundStyle(Color.appDestructive)

            Text("Failed to connect")
                .font(.system(size: 13))
                .foregroundStyle(Color.appTextSecondary)

            Spacer()

            Button(action: onConnect) {
                Text("try again")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color.appTint)
            }
        }
    }

    // MARK: - Connected Banner

    private var connectedBanner: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 14))
                .foregroundStyle(Color.appSuccess)

            Text("Scale connected")
                .font(.system(size: 13))
                .foregroundStyle(Color.appTextSecondary)

            Spacer()
        }
    }

    // MARK: - Scanning

    private var scanningContent: some View {
        HStack(spacing: Spacing.sm) {
            ProgressView()
                .tint(.white)

            Text("Scanning for scale\u{2026}")
                .font(.system(size: 13))
                .foregroundStyle(Color.appTextSecondary)

            Spacer()

            Button("Cancel", action: onCancelScan)
                .font(.system(size: 12))
                .foregroundStyle(Color.appTextTertiary)
        }
    }

    // MARK: - Connecting

    private var connectingContent: some View {
        HStack(spacing: Spacing.sm) {
            ProgressView()
                .tint(.white)

            Text("Connecting\u{2026}")
                .font(.system(size: 13))
                .foregroundStyle(Color.appTextSecondary)
        }
    }

    // MARK: - Waiting (connected, no reading)

    private var waitingContent: some View {
        HStack(spacing: Spacing.sm) {
            ProgressView()
                .tint(.white)

            Text("Waiting for scale\u{2026}")
                .font(.system(size: 13))
                .foregroundStyle(Color.appTextSecondary)

            Spacer()

            Button("Disconnect", action: onDisconnect)
                .font(.system(size: 12))
                .foregroundStyle(Color.appTextTertiary)
        }
    }

    // MARK: - Reading

    private func readingContent(_ reading: ScaleReading) -> some View {
        HStack(spacing: Spacing.md) {
            HStack(spacing: Spacing.sm) {
                // Stable / Measuring badge
                Text(reading.stable ? "Stable" : "Measuring\u{2026}")
                    .font(.system(size: 12, weight: .semibold))
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
                .font(.system(size: 12))
                .foregroundStyle(Color.appTextTertiary)
        }
    }
}
