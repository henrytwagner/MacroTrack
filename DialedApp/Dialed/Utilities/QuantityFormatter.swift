import Foundation

/// Format a food quantity for display based on its unit.
/// Uses unit-specific minimum decimal places, but preserves additional
/// significant digits from the actual value (e.g. 0.375 g → "0.375").
/// - g, ml → 0 minimum decimals (e.g. "100", but "0.375" if fractional)
/// - oz, fl oz → 1 minimum decimal (e.g. "3.5", but "0.375" if more precise)
/// - all others → 0 minimum decimals
func formatQuantity(_ value: Double, unit: String) -> String {
    let u = unit.lowercased()
    let minDecimals: Int
    if u == "g" || u == "ml" {
        minDecimals = 0
    } else if u == "oz" || u == "fl oz" {
        minDecimals = 1
    } else {
        minDecimals = 0
    }

    // Round to 4 decimal places to avoid floating-point noise,
    // then strip trailing zeros while preserving at least minDecimals.
    let rounded = (value * 10000).rounded() / 10000
    let formatted = String(format: "%.4f", rounded)

    let parts = formatted.split(separator: ".", maxSplits: 2)
    let intPart = String(parts[0])

    guard parts.count == 2 else {
        return minDecimals > 0 ? String(format: "%.\(minDecimals)f", value) : intPart
    }

    var decPart = String(parts[1])
    while decPart.count > minDecimals && decPart.hasSuffix("0") {
        decPart.removeLast()
    }

    if decPart.isEmpty {
        return intPart
    }
    return "\(intPart).\(decPart)"
}
