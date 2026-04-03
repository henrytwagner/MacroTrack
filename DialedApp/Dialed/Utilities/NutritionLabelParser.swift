import Foundation

// MARK: - Server Response Type

/// Raw structured response from Gemini after parsing a nutrition label image.
/// Maps 1:1 to the JSON the server returns.
struct ParsedNutritionLabelResponse: Codable, Sendable {
    var name: String?
    var brandName: String?
    var servingSize: Double?
    var servingUnit: String?
    var servingSizeAlt: Double?
    var servingSizeAltUnit: String?
    var calories: Double?
    var proteinG: Double?
    var carbsG: Double?
    var fatG: Double?
    var sodiumMg: Double?
    var cholesterolMg: Double?
    var fiberG: Double?
    var sugarG: Double?
    var saturatedFatG: Double?
    var transFatG: Double?
}

// MARK: - Parsed Result Types

enum ParsedFieldStatus: Sendable {
    case parsed
    case converted
    case needsReview
}

struct ParsedServingSize: Sendable {
    var canonicalQuantity: Double
    var canonicalUnit: String       // "g" or "ml"
    var originalLabel: String       // display hint: "1 cup (240mL)"
    var originalQuantity: Double?   // the non-canonical side
    var originalUnit: String?       // e.g. "cups"
    var status: ParsedFieldStatus
}

struct ParsedNutritionLabel: Sendable {
    var name: String?
    var brandName: String?
    var servingSize: ParsedServingSize
    var calories: Double?
    var proteinG: Double?
    var carbsG: Double?
    var fatG: Double?
    var sodiumMg: Double?
    var cholesterolMg: Double?
    var fiberG: Double?
    var sugarG: Double?
    var saturatedFatG: Double?
    var transFatG: Double?
    var reviewFlags: [String]
}

// MARK: - NutritionLabelParser

/// Validates and normalizes Gemini's structured nutrition label response
/// into canonical units with review flags.
/// All methods are `nonisolated static` so they can be called from any isolation domain.
enum NutritionLabelParser {

    // Ratio tables mirrored from MeasurementUnits._Ratios so nonisolated static
    // methods can access them without crossing MainActor boundaries.
    private enum _Ratios {
        nonisolated static let weightG: [String: Double] = [
            "g": 1.0, "oz": 28.3495, "kg": 1000.0, "lb": 453.592
        ]
        nonisolated static let volumeMl: [String: Double] = [
            "ml": 1.0, "L": 1000.0, "fl oz": 29.5735,
            "tbsp": 14.7868, "tsp": 4.92892, "cups": 236.588
        ]
    }

    private nonisolated static func _measurementSystem(for unit: String) -> MeasurementSystemCategory {
        if _Ratios.weightG[unit] != nil { return .weight }
        if _Ratios.volumeMl[unit] != nil { return .volume }
        return .abstract
    }

    private nonisolated static func _convertUnit(
        fromUnit: String, fromQty: Double, toUnit: String
    ) -> Double? {
        if let fromG = _Ratios.weightG[fromUnit], let toG = _Ratios.weightG[toUnit] {
            return fromQty * fromG / toG
        }
        if let fromMl = _Ratios.volumeMl[fromUnit], let toMl = _Ratios.volumeMl[toUnit] {
            return fromQty * fromMl / toMl
        }
        return nil
    }

    // Unit alias lookup — maps Gemini's output strings to canonical app unit strings.
    // Uses the same unit strings as allServingUnits in MeasurementUnits.swift.
    // nonisolated static let so Swift 6 default-MainActor isolation doesn't block
    // access from nonisolated functions. Safe because [String: String] is Sendable.
    nonisolated static let unitAliases: [String: String] = [
        // weight
        "g": "g", "gram": "g", "grams": "g",
        "oz": "oz", "ounce": "oz", "ounces": "oz",
        "kg": "g", "lb": "g", "lbs": "g", "pound": "g", "pounds": "g",
        // volume
        "ml": "ml", "milliliter": "ml", "milliliters": "ml", "millilitre": "ml",
        "l": "L", "liter": "L", "liters": "L", "litre": "L",
        "fl oz": "fl oz", "fluid oz": "fl oz", "fluid ounce": "fl oz", "fluid ounces": "fl oz",
        "tbsp": "tbsp", "tablespoon": "tbsp", "tablespoons": "tbsp",
        "tsp": "tsp", "teaspoon": "tsp", "teaspoons": "tsp",
        "cup": "cups", "cups": "cups",
        // abstract
        "serving": "servings", "servings": "servings",
        "slice": "slices", "slices": "slices",
        "piece": "pieces", "pieces": "pieces",
        "portion": "portion", "scoop": "scoop",
        "can": "can", "bottle": "bottle", "packet": "packet", "clove": "clove",
    ]

    /// Normalize a unit string from Gemini to canonical app unit.
    /// Returns nil if unrecognized.
    nonisolated static func normalizeUnit(_ raw: String) -> String? {
        unitAliases[raw.lowercased().trimmingCharacters(in: .whitespaces)]
    }

    /// Check if a unit is metric (g, ml, kg, L).
    nonisolated static func isMetric(_ unit: String) -> Bool {
        let u = unit.lowercased()
        return ["g", "gram", "grams", "ml", "milliliter", "milliliters", "millilitre",
                "l", "liter", "liters", "litre", "kg"].contains(u)
    }

    /// Normalize a ParsedNutritionLabelResponse from the server into a ParsedNutritionLabel
    /// with canonical units and review flags.
    nonisolated static func normalize(_ response: ParsedNutritionLabelResponse) -> ParsedNutritionLabel {
        var reviewFlags: [String] = []

        // Resolve serving size with dual-unit handling
        let servingSize = resolveServingSize(
            size: response.servingSize,
            unit: response.servingUnit,
            altSize: response.servingSizeAlt,
            altUnit: response.servingSizeAltUnit,
            reviewFlags: &reviewFlags
        )

        return ParsedNutritionLabel(
            name: response.name,
            brandName: response.brandName,
            servingSize: servingSize,
            calories: response.calories,
            proteinG: response.proteinG,
            carbsG: response.carbsG,
            fatG: response.fatG,
            sodiumMg: response.sodiumMg,
            cholesterolMg: response.cholesterolMg,
            fiberG: response.fiberG,
            sugarG: response.sugarG,
            saturatedFatG: response.saturatedFatG,
            transFatG: response.transFatG,
            reviewFlags: reviewFlags
        )
    }

    // MARK: - Private Helpers

    private nonisolated static func resolveServingSize(
        size: Double?,
        unit: String?,
        altSize: Double?,
        altUnit: String?,
        reviewFlags: inout [String]
    ) -> ParsedServingSize {
        let primaryUnit = unit.flatMap { normalizeUnit($0) }
        let secondaryUnit = altUnit.flatMap { normalizeUnit($0) }
        let primarySize = size ?? 0
        let secondarySize = altSize

        // Determine which is metric and which is the "original" display unit
        let primaryIsMetric = unit.map { isMetric($0) } ?? false
        let secondaryIsMetric = altUnit.map { isMetric($0) } ?? false

        // Case 1: Both present — prefer metric as canonical
        if let pUnit = primaryUnit, let sUnit = secondaryUnit,
           let sSize = secondarySize {
            if primaryIsMetric && !secondaryIsMetric {
                // Primary is metric — use it as canonical
                let label = buildLabel(size: sSize, unit: unit ?? "", altSize: primarySize, altUnit: pUnit)
                return ParsedServingSize(
                    canonicalQuantity: primarySize,
                    canonicalUnit: canonicalMetricUnit(pUnit),
                    originalLabel: label,
                    originalQuantity: sSize,
                    originalUnit: sUnit,
                    status: .parsed
                )
            } else if secondaryIsMetric && !primaryIsMetric {
                // Secondary is metric — use it as canonical
                let label = buildLabel(size: primarySize, unit: unit ?? "", altSize: sSize, altUnit: sUnit)
                return ParsedServingSize(
                    canonicalQuantity: sSize,
                    canonicalUnit: canonicalMetricUnit(sUnit),
                    originalLabel: label,
                    originalQuantity: primarySize,
                    originalUnit: pUnit,
                    status: .parsed
                )
            } else {
                // Both metric or both imperial — use primary
                let label = buildLabel(size: primarySize, unit: unit ?? "", altSize: sSize, altUnit: sUnit)
                return ParsedServingSize(
                    canonicalQuantity: primarySize,
                    canonicalUnit: pUnit,
                    originalLabel: label,
                    originalQuantity: sSize,
                    originalUnit: sUnit,
                    status: .parsed
                )
            }
        }

        // Case 2: Only primary present
        if let pUnit = primaryUnit {
            let sys = _measurementSystem(for: pUnit)
            switch sys {
            case .weight:
                // Convert to grams if not already
                if pUnit == "g" {
                    return ParsedServingSize(
                        canonicalQuantity: primarySize,
                        canonicalUnit: "g",
                        originalLabel: "\(formatNum(primarySize)) \(pUnit)",
                        originalQuantity: nil,
                        originalUnit: nil,
                        status: .parsed
                    )
                } else if let converted = _convertUnit(fromUnit: pUnit, fromQty: primarySize, toUnit: "g") {
                    return ParsedServingSize(
                        canonicalQuantity: converted,
                        canonicalUnit: "g",
                        originalLabel: "\(formatNum(primarySize)) \(unit ?? pUnit)",
                        originalQuantity: primarySize,
                        originalUnit: pUnit,
                        status: .converted
                    )
                }
            case .volume:
                if pUnit == "ml" {
                    return ParsedServingSize(
                        canonicalQuantity: primarySize,
                        canonicalUnit: "ml",
                        originalLabel: "\(formatNum(primarySize)) \(pUnit)",
                        originalQuantity: nil,
                        originalUnit: nil,
                        status: .parsed
                    )
                } else if let converted = _convertUnit(fromUnit: pUnit, fromQty: primarySize, toUnit: "ml") {
                    return ParsedServingSize(
                        canonicalQuantity: converted,
                        canonicalUnit: "ml",
                        originalLabel: "\(formatNum(primarySize)) \(unit ?? pUnit)",
                        originalQuantity: primarySize,
                        originalUnit: pUnit,
                        status: .converted
                    )
                }
            case .abstract:
                // Abstract units can't be converted — flag for review
                reviewFlags.append("Abstract unit '\(pUnit)' cannot be converted to metric")
                return ParsedServingSize(
                    canonicalQuantity: primarySize,
                    canonicalUnit: pUnit,
                    originalLabel: "\(formatNum(primarySize)) \(unit ?? pUnit)",
                    originalQuantity: nil,
                    originalUnit: nil,
                    status: .needsReview
                )
            }
        }

        // Case 3: No unit at all
        if let size = size, size > 0 {
            reviewFlags.append("No serving unit found on label")
            return ParsedServingSize(
                canonicalQuantity: size,
                canonicalUnit: "g",
                originalLabel: "\(formatNum(size))",
                originalQuantity: nil,
                originalUnit: nil,
                status: .needsReview
            )
        }

        // Case 4: Nothing found
        reviewFlags.append("No serving size found on label")
        return ParsedServingSize(
            canonicalQuantity: 0,
            canonicalUnit: "g",
            originalLabel: "Unknown",
            originalQuantity: nil,
            originalUnit: nil,
            status: .needsReview
        )
    }

    /// Map a normalized unit to its base metric unit ("g" for weight, "ml" for volume).
    private nonisolated static func canonicalMetricUnit(_ unit: String) -> String {
        switch _measurementSystem(for: unit) {
        case .weight: return "g"
        case .volume: return "ml"
        case .abstract: return unit
        }
    }

    /// Build the display label string like "1 cup (240 mL)".
    private nonisolated static func buildLabel(size: Double, unit: String, altSize: Double, altUnit: String) -> String {
        "\(formatNum(size)) \(unit) (\(formatNum(altSize)) \(altUnit))"
    }

    /// Format a number for display — drop ".0" for integers.
    private nonisolated static func formatNum(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(v)) : String(format: "%.1f", v)
    }
}
