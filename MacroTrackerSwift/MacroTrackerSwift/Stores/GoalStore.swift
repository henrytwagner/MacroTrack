import Foundation
import Observation

/// Caches goal data keyed by date string.
/// Direct port of mobile/stores/goalStore.ts.
@Observable @MainActor
final class GoalStore {
    static let shared = GoalStore()

    var goalsByDate: [String: DailyGoal?] = [:]
    var metaByDate:  [String: GoalForDateResponse?] = [:]
    var profiles:    [GoalProfileListItem] = []
    var isLoading:   Bool = false
    var error:       String? = nil

    private init() {}

    func fetch(date: String) async {
        isLoading = true
        error = nil
        do {
            let res = try await APIClient.shared.getGoalsForDate(date)
            goalsByDate[date] = res.goals
            metaByDate[date]  = res
            isLoading = false
        } catch {
            isLoading = false
            self.error = error.localizedDescription
        }
    }

    func refreshProfiles() async {
        do {
            let res = try await APIClient.shared.getGoalProfiles()
            profiles = res.profiles
        } catch {
            // non-critical — swallow
        }
    }

    func saveChange(data: UpdateGoalsForDateRequest) async {
        isLoading = true
        error = nil
        do {
            let res = try await APIClient.shared.changeGoals(data)
            goalsByDate[res.date] = res.goals
            metaByDate[res.date]  = res
            isLoading = false
            await refreshProfiles()
        } catch {
            isLoading = false
            self.error = error.localizedDescription
        }
    }
}
