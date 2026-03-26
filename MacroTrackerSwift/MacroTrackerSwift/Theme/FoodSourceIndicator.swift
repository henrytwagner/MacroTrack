import SwiftUI

// MARK: - FoodSourceIndicator

/// Log-style SF Symbol + badge accent per `FoodSource` (matches former pill colors).
enum FoodSourceIndicator {
    static func systemImage(for source: FoodSource) -> String {
        switch source {
        case .custom:    return "person"
        case .community: return "person.2"
        case .database:  return "icloud"
        }
    }

    static func accentColor(for source: FoodSource) -> Color {
        switch source {
        case .custom:    return Color.appTint
        case .community: return Color.appSuccess
        case .database:  return Color.appWarning
        }
    }
}
