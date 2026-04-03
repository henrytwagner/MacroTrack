import Foundation

// MARK: - Value Types

enum ScaleUnit: String, Sendable, Codable {
    case g
    case ml
    case oz
    case lbOz = "lb:oz"
}

struct ScaleReading: Sendable, Equatable {
    let value: Double
    let unit: ScaleUnit
    let display: String
    let stable: Bool
    let rawHex: String
}

struct ScaleDevice: Sendable, Identifiable {
    let id: String
    let name: String
    let rssi: Int
}

// MARK: - Connection State

enum ScaleConnectionState: Sendable, Equatable {
    case idle
    case scanning
    case connecting
    case connected
    case error(String)

    var isActive: Bool {
        switch self {
        case .scanning, .connecting, .connected: return true
        default: return false
        }
    }
}
