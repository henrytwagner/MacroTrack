import Foundation

/// Units that use the standard decimal pad (metric/precision).
/// Everything else gets the fraction keyboard.
private let decimalPadUnits: Set<String> = [
    "g", "ml", "kg", "L", "oz", "fl oz", "lb"
]

/// Returns `true` if the unit should use the fraction wheel keyboard
/// instead of the standard decimal pad.
nonisolated func unitUsesFractionKeyboard(_ unit: String) -> Bool {
    !decimalPadUnits.contains(unit)
}
