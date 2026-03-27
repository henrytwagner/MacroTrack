import SwiftUI

/// App-wide manager for BLE kitchen scale connectivity.
/// Owns the active ScaleProtocol instance and exposes state for UI consumption.
@Observable @MainActor
final class ScaleManager {
    static let shared = ScaleManager()

    // MARK: - Public State

    private(set) var connectionState: ScaleConnectionState = .idle
    private(set) var latestReading: ScaleReading? = nil

    // MARK: - Preferences

    @ObservationIgnored
    @AppStorage("scaleAutoConnect") var autoConnectEnabled: Bool = true

    @ObservationIgnored
    @AppStorage("lastPairedScaleId") private var lastPairedScaleId: String = ""

    // MARK: - Private

    private var activeService: (any ScaleProtocol)?
    private var readingTask: Task<Void, Never>?

    private init() {}

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
            self.connectionState = service.connectionState
        }
    }

    func disconnect() {
        readingTask?.cancel()
        readingTask = nil
        activeService?.disconnect()
        activeService = nil
        latestReading = nil
        connectionState = .idle
    }

    func cancelScan() {
        activeService?.cancelScan()
        readingTask?.cancel()
        readingTask = nil
        activeService = nil
        connectionState = .idle
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
                    self.connectionState = newState
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
