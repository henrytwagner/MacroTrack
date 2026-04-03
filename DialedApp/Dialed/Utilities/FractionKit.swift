import Foundation

// MARK: - CupFraction

/// Common fractional amounts for non-metric quantity input.
enum CupFraction: Int, CaseIterable, Sendable {
    case none           = 0
    case eighth         = 1
    case quarter        = 2
    case third          = 3
    case half           = 4
    case twoThirds      = 5
    case threeQuarters  = 6

    var decimalValue: Double {
        switch self {
        case .none:           return 0.0
        case .eighth:         return 0.125
        case .quarter:        return 0.25
        case .third:          return 1.0 / 3.0
        case .half:           return 0.5
        case .twoThirds:      return 2.0 / 3.0
        case .threeQuarters:  return 0.75
        }
    }

    var label: String {
        switch self {
        case .none:           return "—"
        case .eighth:         return "⅛"
        case .quarter:        return "¼"
        case .third:          return "⅓"
        case .half:           return "½"
        case .twoThirds:      return "⅔"
        case .threeQuarters:  return "¾"
        }
    }
}

// MARK: - Whole Number Range

let fractionWholeNumberRange: ClosedRange<Int> = 0...10

// MARK: - Conversion Helpers

/// Splits a Double into the closest (whole, fraction) pair.
nonisolated func closestFraction(to value: Double) -> (whole: Int, fraction: CupFraction) {
    guard value >= 0 else { return (0, .none) }

    let whole = min(Int(value), fractionWholeNumberRange.upperBound)
    let remainder = value - Double(whole)

    // Find the fraction whose decimal value is closest to the remainder
    var best: CupFraction = .none
    var bestDiff: Double = abs(remainder)

    for frac in CupFraction.allCases where frac != .none {
        let diff = abs(remainder - frac.decimalValue)
        if diff < bestDiff {
            bestDiff = diff
            best = frac
        }
    }

    // If the best fraction rounds up past 1.0 (e.g. value=0.9 → whole=0, frac=¾ is closer than 1+none),
    // check if bumping whole+1 with .none is closer
    let reconstructed = Double(whole) + best.decimalValue
    let nextWhole = Double(whole + 1)
    if whole < fractionWholeNumberRange.upperBound &&
       abs(value - nextWhole) < abs(value - reconstructed) {
        return (whole + 1, .none)
    }

    return (whole, best)
}

/// Converts a (whole, fraction) pair to a clean decimal string for text field binding.
nonisolated func fractionToDecimalString(whole: Int, fraction: CupFraction) -> String {
    let value = Double(whole) + fraction.decimalValue
    if fraction == .none {
        return String(whole)
    }
    // Use enough precision for thirds (0.333, 0.667) but trim trailing zeros for clean values
    if fraction == .third {
        return whole == 0 ? "0.333" : String(format: "%.3f", value)
    }
    if fraction == .twoThirds {
        return whole == 0 ? "0.667" : String(format: "%.3f", value)
    }
    // For clean fractions (0.125, 0.25, 0.5, 0.75), use minimal decimals
    let str = String(value)
    return str
}
