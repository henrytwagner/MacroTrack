import Foundation

// MARK: - Scale Weighing Helpers

/// Computes scaled macros for a given weight value using base serving data.
/// Handles unit conversion between scale unit and food's base serving unit.
/// Shared by DraftMealCard (Kitchen Mode) and FoodDetailViewModel (manual mode).
func scaledMacrosForWeight(
    value: Double,
    unitRaw: String,
    baseMacros: Macros,
    baseServingSize: Double,
    baseServingUnit: String
) -> Macros? {
    guard baseServingSize > 0 else { return nil }

    var valueInBaseUnit = value
    if unitRaw != baseServingUnit,
       let fromG = weightRatiosG[unitRaw],
       let toG = weightRatiosG[baseServingUnit] {
        valueInBaseUnit = value * fromG / toG
    }

    let scale = valueInBaseUnit / baseServingSize
    return Macros(
        calories: baseMacros.calories * scale,
        proteinG: baseMacros.proteinG * scale,
        carbsG:   baseMacros.carbsG   * scale,
        fatG:     baseMacros.fatG     * scale)
}

/// Computes scaled macros directly from a ScaleReading.
func scaledMacrosForScaleReading(
    _ reading: ScaleReading,
    baseMacros: Macros,
    baseServingSize: Double,
    baseServingUnit: String
) -> Macros? {
    scaledMacrosForWeight(
        value: reading.value,
        unitRaw: reading.unit.rawValue,
        baseMacros: baseMacros,
        baseServingSize: baseServingSize,
        baseServingUnit: baseServingUnit)
}
