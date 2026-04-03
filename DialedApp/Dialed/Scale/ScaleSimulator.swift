import Foundation

/// Simulated scale for Simulator builds and SwiftUI previews.
/// Ramps weight from 0 → 245g over 15 ticks, then stabilizes.
@MainActor
final class ScaleSimulator: ScaleProtocol, @unchecked Sendable {

    private(set) var connectionState: ScaleConnectionState = .idle
    private(set) var latestReading: ScaleReading? = nil

    private var readingContinuation: AsyncStream<ScaleReading>.Continuation?
    private var simulationTask: Task<Void, Never>?

    func connect() async {
        connectionState = .scanning

        // Simulate brief scan delay
        try? await Task.sleep(for: .milliseconds(300))
        guard connectionState == .scanning else { return }

        connectionState = .connecting

        try? await Task.sleep(for: .milliseconds(200))
        guard connectionState == .connecting else { return }

        connectionState = .connected
        startSimulation()
    }

    func disconnect() {
        simulationTask?.cancel()
        simulationTask = nil
        readingContinuation?.finish()
        readingContinuation = nil
        latestReading = nil
        connectionState = .idle
    }

    func cancelScan() {
        simulationTask?.cancel()
        simulationTask = nil
        readingContinuation?.finish()
        readingContinuation = nil
        connectionState = .idle
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

    // MARK: - Simulation

    private static let target = 245.0
    private static let ticks = 15
    private static let tickInterval: Duration = .milliseconds(100)
    private static let stabilizeThreshold = 1.0

    private func startSimulation() {
        simulationTask = Task { [weak self] in
            guard let self else { return }
            var history: [Double] = []

            for tick in 1...(Self.ticks + 5) {
                guard !Task.isCancelled else { return }
                try? await Task.sleep(for: Self.tickInterval)
                guard !Task.isCancelled else { return }

                let progress = min(Double(tick) / Double(Self.ticks), 1.0)
                let noise = (Double.random(in: 0...1) - 0.5) * 4
                let raw = Self.target * progress + noise
                let value = max(0, (raw * 10).rounded() / 10)
                history.append(value)

                let stable = progress >= 1.0 && Self.isStable(history)
                let reading = ScaleReading(
                    value: value,
                    unit: .g,
                    display: String(format: "%.1f g", value),
                    stable: stable,
                    rawHex: "FE EF C0 A2 -- -- 00 00 -- -- -- --  [simulated]"
                )

                self.latestReading = reading
                self.readingContinuation?.yield(reading)
            }
        }
    }

    private static func isStable(_ vals: [Double]) -> Bool {
        guard vals.count >= 3 else { return false }
        let last3 = vals.suffix(3)
        let range = last3.max()! - last3.min()!
        return range <= stabilizeThreshold
    }
}
