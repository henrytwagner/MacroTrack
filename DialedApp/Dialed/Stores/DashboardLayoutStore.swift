import Foundation
import Observation

/// Persists the user's chosen dashboard macro layout.
/// Port of mobile/stores/dashboardLayoutStore.ts.
@Observable @MainActor
final class DashboardLayoutStore {
    static let shared = DashboardLayoutStore()

    /// Valid values: "bars" | "nested-rings" | "activity-rings"
    var layoutId: String = UserDefaults.standard.string(forKey: "dashboardLayoutId") ?? "bars" {
        didSet { UserDefaults.standard.set(layoutId, forKey: "dashboardLayoutId") }
    }

    private init() {}
}
