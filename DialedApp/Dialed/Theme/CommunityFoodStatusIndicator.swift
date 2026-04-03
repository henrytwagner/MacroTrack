import SwiftUI

// MARK: - CommunityFoodStatusIndicator

/// Icons + accent colors for community moderation status (replaces text pills on manage list).
enum CommunityFoodStatusIndicator {
    static func systemImage(for status: CommunityFoodStatus) -> String {
        switch status {
        case .active:  return "checkmark.circle.fill"
        case .pending: return "clock"
        case .retired: return "archivebox"
        }
    }

    static func accentColor(for status: CommunityFoodStatus) -> Color {
        switch status {
        case .active:  return Color.appSuccess
        case .pending: return Color.appWarning
        case .retired: return Color.appTextSecondary
        }
    }

    static func accessibilityLabel(for status: CommunityFoodStatus) -> String {
        switch status {
        case .active:  return "Active"
        case .pending: return "Pending review"
        case .retired: return "Retired"
        }
    }
}
