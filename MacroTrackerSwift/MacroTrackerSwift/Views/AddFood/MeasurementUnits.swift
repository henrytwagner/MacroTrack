// ============================================================
// MeasurementUnits — weight/volume ratio tables and unit helpers
// ============================================================

import Foundation

// MARK: - All Serving Units
// Top-level let accessed from @MainActor views — that's fine.

let allServingUnits: [String] = [
    "g", "oz", "cups", "servings", "ml", "tbsp", "tsp",
    "L", "fl oz", "slices", "pieces", "portion", "scoop",
    "can", "bottle", "packet", "clove"
]

// MARK: - Ratio Tables (accessible to nonisolated contexts via static let on a type)

/// Weight / volume ratio tables behind a type boundary so `nonisolated` functions
/// can read them without hitting the "Main actor-isolated let" restriction
/// (Swift 6 default-actor-isolation = MainActor treats top-level lets as @MainActor).
private enum _Ratios {
    // grams per 1 unit — nonisolated so Swift 6 default-MainActor isolation doesn't
    // block access from nonisolated functions. Safe because [String: Double] is Sendable.
    nonisolated static let weightG: [String: Double] = [
        "g":  1.0,
        "oz": 28.3495,
        "kg": 1000.0,
        "lb": 453.592
    ]
    // mL per 1 unit
    nonisolated static let volumeMl: [String: Double] = [
        "ml":    1.0,
        "L":     1000.0,
        "fl oz": 29.5735,
        "tbsp":  14.7868,
        "tsp":   4.92892,
        "cups":  236.588
    ]
}

// Public aliases for callers in @MainActor contexts (views).
var weightRatiosG: [String: Double]  { _Ratios.weightG  }
var volumeRatiosMl: [String: Double] { _Ratios.volumeMl }

// MARK: - Measurement System

enum MeasurementSystemCategory: Sendable {
    case weight, volume, abstract
}

nonisolated func measurementSystem(for unit: String) -> MeasurementSystemCategory {
    if _Ratios.weightG[unit]  != nil { return .weight }
    if _Ratios.volumeMl[unit] != nil { return .volume }
    return .abstract
}

// MARK: - Conflict Detection

struct ConflictItem: Sendable {
    var unitName: String
    var oldQIBS:  Double
    var newQIBS:  Double
}

/// For each existing conversion in the same measurement system as `toUnit`,
/// computes the QIBS that `newQIBS` implies for that unit and flags it
/// if the deviation from the stored value exceeds 1%.
nonisolated func checkConflicts(
    toUnit: String,
    newQIBS: Double,
    existingConversions: [(unitName: String, quantityInBaseServings: Double)]
) -> [ConflictItem] {
    var conflicts: [ConflictItem] = []
    for existing in existingConversions {
        let expectedQIBS: Double
        if let toStd = _Ratios.weightG[toUnit],
           let existStd = _Ratios.weightG[existing.unitName] {
            expectedQIBS = newQIBS * (existStd / toStd)
        } else if let toStd = _Ratios.volumeMl[toUnit],
                  let existStd = _Ratios.volumeMl[existing.unitName] {
            expectedQIBS = newQIBS * (existStd / toStd)
        } else {
            continue
        }
        let deviation = abs(expectedQIBS - existing.quantityInBaseServings)
                        / max(existing.quantityInBaseServings, 1e-10)
        if deviation > 0.01 {
            conflicts.append(ConflictItem(
                unitName: existing.unitName,
                oldQIBS:  existing.quantityInBaseServings,
                newQIBS:  expectedQIBS))
        }
    }
    return conflicts
}

// MARK: - Auto-Convert

/// Attempts to pre-fill a conversion form by matching unit systems.
/// Returns `(fromUnit, fromQty, toQty)` where `toQty = 1` (the locked to-unit)
/// and `fromQty` is the equivalent amount in `fromUnit`.
/// Tries a direct path first (servingUnit → toUnit), then bridges through
/// any existing conversion in the same system.
/// Returns nil if no matching system path is found.
nonisolated func tryAutoConvert(
    toUnit: String,
    servingUnit: String,
    servingSize: Double,
    existingQIBS: [(unitName: String, quantityInBaseServings: Double)]
) -> (fromUnit: String, fromQty: Double, toQty: Double)? {
    // Direct path: servingUnit → toUnit in the same measurement system.
    // Mirror RN: anchor fromQty to the actual serving size so the form reads
    // "100 g = 3.53 oz" rather than the raw unit ratio "28.35 g = 1 oz".
    // Guard servingSize > 0 so a not-yet-filled serving size falls through to the bridge path.
    if let toStd = _Ratios.weightG[toUnit], let fromStd = _Ratios.weightG[servingUnit], servingSize > 0 {
        return (fromUnit: servingUnit, fromQty: servingSize, toQty: (servingSize * fromStd) / toStd)
    }
    if let toStd = _Ratios.volumeMl[toUnit], let fromStd = _Ratios.volumeMl[servingUnit], servingSize > 0 {
        return (fromUnit: servingUnit, fromQty: servingSize, toQty: (servingSize * fromStd) / toStd)
    }

    // Bridge path: find an existing conversion in the same system as toUnit
    if let toG = _Ratios.weightG[toUnit] {
        for existing in existingQIBS {
            if let existG = _Ratios.weightG[existing.unitName] {
                return (fromUnit: existing.unitName, fromQty: toG / existG, toQty: 1.0)
            }
        }
    }
    if let toMl = _Ratios.volumeMl[toUnit] {
        for existing in existingQIBS {
            if let existMl = _Ratios.volumeMl[existing.unitName] {
                return (fromUnit: existing.unitName, fromQty: toMl / existMl, toQty: 1.0)
            }
        }
    }

    return nil
}
