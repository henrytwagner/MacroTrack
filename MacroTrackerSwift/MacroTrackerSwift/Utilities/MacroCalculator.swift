import Foundation

/// Static macro-target estimator using the Mifflin-St Jeor equation.
/// Shared by onboarding and GoalsGuidedView.
enum MacroCalculator {

    struct Result {
        var calories: Int
        var proteinG: Int
        var carbsG:   Int
        var fatG:     Int
    }

    /// Estimate daily macro targets from body stats + goal parameters.
    static func estimate(
        weightKg:       Double,
        heightCm:       Double,
        ageYears:       Int,
        sex:            Sex,
        activityLevel:  ActivityLevel,
        goalType:       GoalType,
        aggressiveness: GoalAggressiveness
    ) -> Result {
        let age = Double(ageYears)

        // BMR — Mifflin-St Jeor
        let bmr: Double
        if sex == .female {
            bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161
        } else {
            bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5
        }

        // TDEE
        let activityFactor: Double
        switch activityLevel {
        case .sedentary: activityFactor = 1.2
        case .light:     activityFactor = 1.375
        case .moderate:  activityFactor = 1.55
        case .high:      activityFactor = 1.725
        case .veryHigh:  activityFactor = 1.9
        }
        let tdee = bmr * activityFactor

        // Goal multiplier
        let multiplier: Double
        switch (goalType, aggressiveness) {
        case (.cut,      .mild):       multiplier = 0.9
        case (.cut,      .standard):   multiplier = 0.85
        case (.cut,      .aggressive): multiplier = 0.8
        case (.maintain, _):           multiplier = 1.0
        case (.gain,     .mild):       multiplier = 1.05
        case (.gain,     .standard):   multiplier = 1.1
        case (.gain,     .aggressive): multiplier = 1.15
        }

        let targetCalories = (tdee * multiplier / 10).rounded() * 10

        // Protein
        let proteinPerKg: Double = goalType == .cut ? 2.2 : 1.8
        let proteinG = proteinPerKg * weightKg

        // Fat (minimum 20% of calories)
        var fatG = 0.8 * weightKg
        let minFatCalories = 0.2 * targetCalories
        if fatG * 9 < minFatCalories { fatG = minFatCalories / 9 }

        // Carbs (remainder)
        let carbCals = max(0, targetCalories - proteinG * 4 - fatG * 9)
        let carbsG   = carbCals / 4

        return Result(
            calories: Int(targetCalories),
            proteinG: Int(proteinG.rounded()),
            carbsG:   Int(carbsG.rounded()),
            fatG:     Int(fatG.rounded())
        )
    }

    /// Derive age from an ISO date-of-birth string (YYYY-MM-DD).
    static func ageFromDateOfBirth(iso: String) -> Int? {
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var comps = DateComponents()
        comps.year = parts[0]; comps.month = parts[1]; comps.day = parts[2]
        guard let dob = Calendar.current.date(from: comps) else { return nil }
        return Calendar.current.dateComponents([.year], from: dob, to: Date()).year
    }
}
