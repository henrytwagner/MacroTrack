import SwiftUI

/// Reusable sheet for connecting to a BLE kitchen scale.
/// Presented from Kitchen Mode (long-press scale icon when disconnected)
/// and from Profile > Devices > Kitchen Scale.
@MainActor
struct ScaleConnectionSheet: View {
    private var scale = ScaleManager.shared
    @Environment(\.dismiss) private var dismiss

    @AppStorage("scaleAutoConnect") private var autoConnect: Bool = true
    @AppStorage("lastPairedScaleId") private var lastPairedId: String = ""

    var body: some View {
        NavigationStack {
            List {
                connectionSection
                preferencesSection
                troubleshootingSection
                #if DEBUG
                debugSection
                #endif
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color.appBackground.ignoresSafeArea())
            .navigationTitle("Kitchen Scale")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Color.appTint)
                }
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Connection

    @ViewBuilder
    private var connectionSection: some View {
        #if targetEnvironment(simulator)
        simulatorConnectionSection
        #else
        deviceConnectionSection
        #endif
    }

    // MARK: Simulator

    private var simulatorConnectionSection: some View {
        Section {
            if scale.connectionState == .connected {
                // Already simulating — show status
                HStack(spacing: Spacing.sm) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.appSuccess)
                    Text("Simulated scale active")
                        .font(.appBody)
                        .foregroundStyle(Color.appText)
                }

                Button {
                    scale.disconnect()
                } label: {
                    Text("Disconnect")
                        .font(.appSubhead)
                        .foregroundStyle(Color.appDestructive)
                        .frame(maxWidth: .infinity)
                }
            } else {
                HStack(spacing: Spacing.sm) {
                    Image(systemName: "info.circle")
                        .foregroundStyle(Color.appTextSecondary)
                    Text("Bluetooth is not available in Simulator")
                        .font(.appBody)
                        .foregroundStyle(Color.appTextSecondary)
                }

                Button {
                    scale.simulate()
                } label: {
                    Text("Simulate Scale")
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.sm)
                        .background(Color.appTint)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                }
                .buttonStyle(.plain)

                Button {
                    dismiss()
                } label: {
                    Text("Skip")
                        .font(.appSubhead)
                        .foregroundStyle(Color.appTextSecondary)
                        .frame(maxWidth: .infinity)
                }
            }
        } header: {
            Text("Connection")
        }
    }

    // MARK: Device (real BLE)

    private var deviceConnectionSection: some View {
        Section {
            // Status row
            HStack {
                Label {
                    Text(statusText)
                        .font(.appBody)
                        .foregroundStyle(Color.appText)
                } icon: {
                    Image(systemName: statusIcon)
                        .foregroundStyle(statusColor)
                }

                Spacer()

                actionButton
            }
        } header: {
            Text("Connection")
        }
    }

    @ViewBuilder
    private var actionButton: some View {
        switch scale.connectionState {
        case .idle, .error:
            Button("Connect") {
                scale.connect()
            }
            .font(.appSubhead)
            .foregroundStyle(Color.appTint)
        case .scanning, .connecting:
            Button("Cancel") {
                scale.cancelScan()
            }
            .font(.appSubhead)
            .foregroundStyle(Color.appTextSecondary)
        case .connected:
            Button("Disconnect") {
                scale.disconnect()
            }
            .font(.appSubhead)
            .foregroundStyle(Color.appDestructive)
        }
    }

    // MARK: - Preferences

    private var preferencesSection: some View {
        Section("Preferences") {
            Toggle("Auto-Connect", isOn: $autoConnect)
                .tint(Color.appTint)

            if !lastPairedId.isEmpty {
                HStack {
                    Text("Last Device")
                        .font(.appBody)
                        .foregroundStyle(Color.appText)
                    Spacer()
                    Text(lastPairedId)
                        .font(.appBody)
                        .foregroundStyle(Color.appTextSecondary)
                        .lineLimit(1)
                }
            }
        }
    }

    // MARK: - Troubleshooting

    private var troubleshootingSection: some View {
        Section("Troubleshooting") {
            Label {
                Text("Check that Bluetooth is turned on")
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextSecondary)
            } icon: {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.appTextTertiary)
            }

            Label {
                Text("Wake the scale by pressing the unit button")
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextSecondary)
            } icon: {
                Image(systemName: "hand.tap")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.appTextTertiary)
            }

            Label {
                Text("Move within 3 feet of the scale")
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextSecondary)
            } icon: {
                Image(systemName: "arrow.left.and.right")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.appTextTertiary)
            }
        }
    }

    // MARK: - Debug

    #if DEBUG
    private var debugSection: some View {
        Section("Debug") {
            Button {
                scale.simulate()
            } label: {
                Text("Simulate Scale")
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTint)
            }
        }
    }
    #endif

    // MARK: - Status Helpers

    private var statusText: String {
        switch scale.connectionState {
        case .idle: return "Not connected"
        case .scanning: return "Scanning…"
        case .connecting: return "Connecting…"
        case .connected: return "Connected"
        case .error(let msg): return msg
        }
    }

    private var statusIcon: String {
        switch scale.connectionState {
        case .idle: return "antenna.radiowaves.left.and.right.slash"
        case .scanning, .connecting: return "antenna.radiowaves.left.and.right"
        case .connected: return "checkmark.circle.fill"
        case .error: return "exclamationmark.triangle.fill"
        }
    }

    private var statusColor: Color {
        switch scale.connectionState {
        case .idle: return Color.appTextTertiary
        case .scanning, .connecting: return Color.appTint
        case .connected: return Color.appSuccess
        case .error: return Color.appWarning
        }
    }
}
