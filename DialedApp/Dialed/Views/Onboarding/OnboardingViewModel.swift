import SwiftUI
import Observation

/// Drives the onboarding flow. Created as @State in OnboardingContainerView —
/// not a singleton, so force-quitting mid-flow restarts cleanly.
@Observable @MainActor
final class OnboardingViewModel {

    // MARK: - Navigation

    enum Direction { case forward, backward }

    var currentPage: Int = 0
    var direction: Direction = .forward
    let totalPages = 11  // 0-10 inclusive

    var progress: Double { Double(currentPage) / Double(totalPages) }

    // MARK: - Health fields

    var unitSystem: UnitSystem = .metric
    var heightValue: Double = 170   // cm internally
    var weightValue: Double = 70    // kg internally
    var dateOfBirth: Date = Calendar.current.date(byAdding: .year, value: -25, to: Date()) ?? Date()
    var sex: Sex = .unspecified
    var activityLevel: ActivityLevel? = nil

    // MARK: - Goal fields

    var goalType: GoalType = .cut
    var aggressiveness: GoalAggressiveness = .standard
    var calories: String = ""
    var protein:  String = ""
    var carbs:    String = ""
    var fat:      String = ""

    // MARK: - UI state

    var isSaving: Bool = false
    var saveError: String? = nil

    // MARK: - Unit helpers

    /// Height displayed in the user's preferred unit.
    var displayHeight: Double {
        get { unitSystem == .imperial ? heightValue / 2.54 : heightValue }
        set { heightValue = unitSystem == .imperial ? newValue * 2.54 : newValue }
    }

    var heightFeet: Int {
        get { Int(heightValue / 2.54) / 12 }
        set {
            let inches = Int(heightValue / 2.54) % 12
            heightValue = Double(newValue * 12 + inches) * 2.54
        }
    }

    var heightInches: Int {
        get { Int(heightValue / 2.54) % 12 }
        set {
            let feet = Int(heightValue / 2.54) / 12
            heightValue = Double(feet * 12 + newValue) * 2.54
        }
    }

    /// Weight displayed in the user's preferred unit.
    var displayWeight: Double {
        get { unitSystem == .imperial ? weightValue / 0.45359237 : weightValue }
        set { weightValue = unitSystem == .imperial ? newValue * 0.45359237 : newValue }
    }

    // MARK: - Lifecycle

    func inferUnits() {
        if let region = Locale.current.region?.identifier {
            let imperialRegions: Set<String> = ["US", "LR", "MM"]
            unitSystem = imperialRegions.contains(region) ? .imperial : .metric
        }
    }

    // MARK: - Navigation

    var canAdvance: Bool {
        switch currentPage {
        case 0: return true                         // Welcome
        case 1: return heightValue > 0              // Height
        case 2: return weightValue > 0              // Weight
        case 3: return true                         // DOB (always valid)
        case 4: return true                         // Sex (unspecified is fine)
        case 5: return activityLevel != nil          // Activity
        case 6: return true                         // Goal type
        case 7: return true                         // Aggressiveness
        case 8: return canSaveMacros                // Macro review
        case 9: return true                         // Kitchen Mode tip
        case 10: return true                        // Scale tip (last — triggers save)
        default: return false
        }
    }

    var isLastPage: Bool { currentPage == totalPages - 1 }

    var showBackButton: Bool { currentPage > 0 }

    var nextButtonTitle: String {
        if currentPage == 0 { return "Get Started" }
        if isLastPage { return "Finish" }
        return "Next"
    }

    func advance() {
        guard canAdvance else { return }

        // Trigger macro calculation when leaving the aggressiveness page
        if currentPage == 7 {
            recalculateMacros()
        }

        if currentPage < totalPages - 1 {
            direction = .forward
            withAnimation(.easeInOut(duration: 0.3)) {
                currentPage += 1
            }
        }
    }

    func goBack() {
        guard currentPage > 0 else { return }
        direction = .backward
        withAnimation(.easeInOut(duration: 0.3)) {
            currentPage -= 1
        }
    }

    // MARK: - Macro calculation

    func recalculateMacros() {
        guard let activity = activityLevel else { return }

        let dobISO = isoString(from: dateOfBirth)
        let age = MacroCalculator.ageFromDateOfBirth(iso: dobISO) ?? 25

        let result = MacroCalculator.estimate(
            weightKg:       weightValue,
            heightCm:       heightValue,
            ageYears:       age,
            sex:            sex,
            activityLevel:  activity,
            goalType:       goalType,
            aggressiveness: aggressiveness
        )

        calories = String(result.calories)
        protein  = String(result.proteinG)
        carbs    = String(result.carbsG)
        fat      = String(result.fatG)
    }

    // MARK: - Save

    private var canSaveMacros: Bool {
        parsePositive(calories) != nil &&
        parsePositive(protein)  != nil &&
        parsePositive(carbs)    != nil &&
        parsePositive(fat)      != nil
    }

    /// Persist profile + goals to the server. Returns true on success.
    func saveAll() async -> Bool {
        guard
            let cal = parsePositive(calories),
            let pro = parsePositive(protein),
            let car = parsePositive(carbs),
            let f   = parsePositive(fat)
        else { return false }

        isSaving = true
        saveError = nil

        // 1. Save profile
        let profile = UserProfile(
            heightCm:             heightValue,
            weightKg:             weightValue,
            sex:                  sex,
            dateOfBirth:          isoString(from: dateOfBirth),
            ageYears:             nil,
            activityLevel:        activityLevel,
            preferredUnits:       unitSystem,
            currentGoalProfileId: nil
        )
        await ProfileStore.shared.save(profile)

        if ProfileStore.shared.error != nil {
            isSaving = false
            saveError = "Failed to save profile. Please try again."
            return false
        }

        // 2. Save goals
        let today = todayString()
        await GoalStore.shared.saveChange(data: UpdateGoalsForDateRequest(
            effectiveDate:  today,
            macros:         Macros(calories: cal, proteinG: pro, carbsG: car, fatG: f),
            goalType:       goalType,
            aggressiveness: aggressiveness,
            profileId:      nil,
            newProfileName: "Default Goals"
        ))

        if GoalStore.shared.error != nil {
            isSaving = false
            saveError = "Failed to save goals. Please try again."
            return false
        }

        // Refresh profile so onboardingComplete flips
        await ProfileStore.shared.fetch()

        isSaving = false
        return true
    }

    // MARK: - Helpers

    private func parsePositive(_ s: String) -> Double? {
        guard let n = Double(s), n.isFinite, n > 0 else { return nil }
        return n
    }

    private func isoString(from date: Date) -> String {
        let comps = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", comps.year ?? 2000, comps.month ?? 1, comps.day ?? 1)
    }
}
