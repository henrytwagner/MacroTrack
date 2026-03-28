import SwiftUI

/// App-wide manager for BLE kitchen scale connectivity.
/// Owns the active ScaleProtocol instance and exposes state for UI consumption.
@Observable @MainActor
final class ScaleManager {
    static let shared = ScaleManager()

    // MARK: - Public State

    private(set) var connectionState: ScaleConnectionState = .idle
    private(set) var latestReading: ScaleReading? = nil

    /// Momentary banner flags — set on state transitions, auto-dismissed.
    private(set) var showConnectedBanner = false
    private(set) var showErrorBanner = false
    private var bannerDismissTask: Task<Void, Never>?

    // MARK: - Preferences

    @ObservationIgnored
    @AppStorage("scaleAutoConnect") var autoConnectEnabled: Bool = true

    @ObservationIgnored
    @AppStorage("lastPairedScaleId") private var lastPairedScaleId: String = ""

    // MARK: - Private

    private var activeService: (any ScaleProtocol)?
    private var readingTask: Task<Void, Never>?

    private init() {}

    // MARK: - State Setter

    /// Central state setter — updates connectionState and triggers banner logic.
    private func transition(to newState: ScaleConnectionState) {
        let oldState = connectionState
        connectionState = newState
        guard oldState != newState else { return }

        bannerDismissTask?.cancel()
        bannerDismissTask = nil

        if newState == .connected && oldState != .connected {
            showErrorBanner = false
            showConnectedBanner = true
            bannerDismissTask = Task {
                try? await Task.sleep(for: .seconds(2))
                guard !Task.isCancelled else { return }
                self.showConnectedBanner = false
            }
        } else if newState.isError {
            showConnectedBanner = false
            showErrorBanner = true
            bannerDismissTask = Task {
                try? await Task.sleep(for: .seconds(4))
                guard !Task.isCancelled else { return }
                self.showErrorBanner = false
                self.activeService = nil
                self.connectionState = .idle
            }
        } else {
            showConnectedBanner = false
            showErrorBanner = false
        }
    }

    // MARK: - Public API

    func connect() {
        guard connectionState == .idle || connectionState.isError else { return }

        #if targetEnvironment(simulator)
        let service = ScaleSimulator()
        #else
        let service = BluetoothScaleService()
        #endif

        activeService = service
        startReadingStream(from: service)

        Task {
            await service.connect()
            // Sync service state back to manager
            self.transition(to: service.connectionState)
        }
    }

    func disconnect() {
        readingTask?.cancel()
        readingTask = nil
        activeService?.disconnect()
        activeService = nil
        latestReading = nil
        transition(to: .idle)
    }

    func cancelScan() {
        activeService?.cancelScan()
        readingTask?.cancel()
        readingTask = nil
        activeService = nil
        transition(to: .idle)
    }

    /// Reset from error state back to idle (used when "try again" is tapped).
    func dismissError() {
        guard connectionState.isError else { return }
        activeService = nil
        transition(to: .idle)
    }

    /// Called on Kitchen Mode entry. Auto-connects if enabled and a scale was previously used.
    func autoConnectIfNeeded() {
        guard autoConnectEnabled else { return }
        guard connectionState == .idle else { return }
        // Connect — CoreBluetooth caches recently-seen peripherals so reconnection is fast
        connect()
    }

    /// DEBUG: Use the simulator instead of real BLE hardware.
    func simulate() {
        #if DEBUG
        disconnect()
        let service = ScaleSimulator()
        activeService = service
        startReadingStream(from: service)
        Task { await service.connect() }
        #endif
    }

    // MARK: - Reading Stream

    private func startReadingStream(from service: any ScaleProtocol) {
        readingTask?.cancel()
        readingTask = Task { [weak self] in
            for await reading in service.readings() {
                guard !Task.isCancelled else { break }
                self?.latestReading = reading
            }
        }

        // Also poll connection state from service (it updates from CB delegates)
        Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard let self, let service = self.activeService else { break }
                let newState = service.connectionState
                if self.connectionState != newState {
                    self.transition(to: newState)
                }
            }
        }
    }
}

// MARK: - ScaleConnectionState convenience

extension ScaleConnectionState {
    var isError: Bool {
        if case .error = self { return true }
        return false
    }
}
