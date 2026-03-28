import CoreBluetooth
import Foundation

/// CoreBluetooth implementation of ScaleProtocol for the Etekcity ESN00 nutrition scale.
///
/// CB delegates are `nonisolated` (dispatched on CB's internal queue). State updates
/// are forwarded to `@MainActor` via `Task`. Weight notifications feed an AsyncStream
/// continuation so consumers use async/await only.
final class BluetoothScaleService: NSObject, ScaleProtocol, @unchecked Sendable {

    // MARK: - ScaleProtocol state (read from @MainActor)

    @MainActor private(set) var connectionState: ScaleConnectionState = .idle
    @MainActor private(set) var latestReading: ScaleReading? = nil

    // MARK: - Constants

    private static let weightCharacteristicUUID = CBUUID(string: "00002C12-0000-1000-8000-00805F9B34FB")
    private static let scaleNamePattern = try! NSRegularExpression(pattern: "esn00|etekcity|eteksca", options: .caseInsensitive)
    private static let scanTimeoutSeconds: TimeInterval = 8

    // MARK: - CoreBluetooth internals

    private var centralManager: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var scanTimeoutTask: Task<Void, Never>?
    private var readingContinuation: AsyncStream<ScaleReading>.Continuation?

    /// Set when user calls cancelScan() — suppresses error on scan timeout.
    private var scanCancelled = false

    // MARK: - Init

    override init() {
        super.init()
        // CBCentralManager dispatches delegates on its own queue by default (nil = main queue).
        // We use main queue since all state updates target @MainActor anyway.
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }

    // MARK: - ScaleProtocol

    func connect() async {
        await MainActor.run {
            scanCancelled = false
            latestReading = nil
            connectionState = .scanning
        }

        // Wait for Bluetooth to be powered on
        let ready = await waitForPoweredOn()
        guard ready else { return }

        centralManager.scanForPeripherals(withServices: nil, options: [
            CBCentralManagerScanOptionAllowDuplicatesKey: false
        ])

        // Start scan timeout
        scanTimeoutTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(Self.scanTimeoutSeconds))
            guard !Task.isCancelled else { return }
            guard self.connectionState == .scanning else { return }
            self.centralManager.stopScan()
            if !self.scanCancelled {
                self.connectionState = .error("No Etekcity scales found nearby.")
            }
        }
    }

    func disconnect() {
        scanTimeoutTask?.cancel()
        scanTimeoutTask = nil
        centralManager.stopScan()

        if let peripheral {
            centralManager.cancelPeripheralConnection(peripheral)
        }
        peripheral = nil

        readingContinuation?.finish()
        readingContinuation = nil

        Task { @MainActor in
            self.latestReading = nil
            self.connectionState = .idle
        }
    }

    func cancelScan() {
        scanCancelled = true
        scanTimeoutTask?.cancel()
        scanTimeoutTask = nil
        centralManager.stopScan()

        Task { @MainActor in
            self.connectionState = .idle
        }
    }

    func readings() -> AsyncStream<ScaleReading> {
        AsyncStream { continuation in
            self.readingContinuation = continuation
            continuation.onTermination = { @Sendable _ in
                Task { @MainActor in
                    self.readingContinuation = nil
                }
            }
        }
    }

    // MARK: - Bluetooth State

    private func waitForPoweredOn() async -> Bool {
        if centralManager.state == .poweredOn { return true }

        return await withCheckedContinuation { continuation in
            self.poweredOnContinuation = continuation
            // If state changed while we were setting up, check again
            if centralManager.state == .poweredOn {
                self.poweredOnContinuation = nil
                continuation.resume(returning: true)
            }
        }
    }

    private var poweredOnContinuation: CheckedContinuation<Bool, Never>?

    // MARK: - Helpers

    private func matchesScaleName(_ name: String?) -> Bool {
        guard let name, !name.isEmpty else { return false }
        let range = NSRange(name.startIndex..., in: name)
        return Self.scaleNamePattern.firstMatch(in: name, range: range) != nil
    }
}

// MARK: - CBCentralManagerDelegate

extension BluetoothScaleService: CBCentralManagerDelegate {

    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            switch central.state {
            case .poweredOn:
                self.poweredOnContinuation?.resume(returning: true)
                self.poweredOnContinuation = nil

            case .poweredOff:
                self.poweredOnContinuation?.resume(returning: false)
                self.poweredOnContinuation = nil
                if self.connectionState.isActive {
                    self.connectionState = .error("Bluetooth is off. Enable it and try again.")
                }

            case .unauthorized:
                self.poweredOnContinuation?.resume(returning: false)
                self.poweredOnContinuation = nil
                self.connectionState = .error("Bluetooth permission denied. Allow access in Settings.")

            case .unsupported:
                self.poweredOnContinuation?.resume(returning: false)
                self.poweredOnContinuation = nil
                self.connectionState = .error("Bluetooth not supported on this device.")

            default:
                break // .unknown, .resetting — keep waiting
            }
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
        Task { @MainActor in
            guard self.matchesScaleName(name) else { return }
            guard self.connectionState == .scanning else { return }

            // Found a matching scale — stop scanning and connect
            self.centralManager.stopScan()
            self.scanTimeoutTask?.cancel()
            self.scanTimeoutTask = nil
            self.peripheral = peripheral
            peripheral.delegate = self
            self.connectionState = .connecting
            self.centralManager.connect(peripheral)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        Task { @MainActor in
            peripheral.discoverServices(nil)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: (any Error)?) {
        Task { @MainActor in
            self.peripheral = nil
            self.connectionState = .error(error?.localizedDescription ?? "Failed to connect to scale.")
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: (any Error)?) {
        Task { @MainActor in
            self.peripheral = nil
            self.readingContinuation?.finish()
            self.readingContinuation = nil

            // Only show error if we didn't initiate the disconnect
            if self.connectionState == .connected {
                self.connectionState = .error("Scale disconnected.")
            }
        }
    }
}

// MARK: - CBPeripheralDelegate

extension BluetoothScaleService: CBPeripheralDelegate {

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: (any Error)?) {
        guard let services = peripheral.services else { return }
        for service in services {
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: (any Error)?) {
        guard let characteristics = service.characteristics else { return }
        for characteristic in characteristics {
            if characteristic.properties.contains(.notify) {
                Task { @MainActor in
                    guard characteristic.uuid == Self.weightCharacteristicUUID else { return }
                    peripheral.setNotifyValue(true, for: characteristic)
                    self.connectionState = .connected
                }
            }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: (any Error)?) {
        guard let data = characteristic.value else { return }
        Task { @MainActor in
            guard characteristic.uuid == Self.weightCharacteristicUUID,
                  let reading = parseEtekcityPacket(data) else { return }
            self.latestReading = reading
            self.readingContinuation?.yield(reading)
        }
    }
}
