import Foundation
import Observation

/// Controls the active tab in RootTabView.
/// Injected via @Environment so any view can switch tabs programmatically.
@Observable @MainActor
final class TabRouter {
    static let shared = TabRouter()

    /// 0 = Dashboard, 1 = Log, 2 = Profile
    var selectedTab: Int = 0

    private init() {}
}
