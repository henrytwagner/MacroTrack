import Foundation

/// Abstraction over any BLE kitchen scale (or simulator).
/// Implementations handle their own threading; consumers read state from @MainActor.
protocol ScaleProtocol: AnyObject, Sendable {
    /// Current connection state.
    var connectionState: ScaleConnectionState { get }

    /// Latest weight reading (nil when no data received yet).
    var latestReading: ScaleReading? { get }

    /// Begin scanning and connecting to a scale.
    func connect() async

    /// Disconnect and release resources.
    func disconnect()

    /// Cancel an in-progress scan without triggering error state.
    func cancelScan()

    /// AsyncStream of weight readings. Finishes when disconnected.
    func readings() -> AsyncStream<ScaleReading>
}
