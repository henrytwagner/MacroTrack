import SwiftUI
import Observation

/// Persists the user's color scheme preference and exposes the resolved ColorScheme.
/// Port of mobile/stores/appearanceStore.ts.
@Observable @MainActor
final class AppearanceStore {
    static let shared = AppearanceStore()

    /// Valid values: "system" | "light" | "dark"
    var mode: String = UserDefaults.standard.string(forKey: "appearanceMode") ?? "system" {
        didSet { UserDefaults.standard.set(mode, forKey: "appearanceMode") }
    }

    /// Returns nil for system (follows device setting), .light or .dark otherwise.
    var colorScheme: ColorScheme? {
        switch mode {
        case "light": return .light
        case "dark":  return .dark
        default:      return nil
        }
    }

    private init() {}
}
