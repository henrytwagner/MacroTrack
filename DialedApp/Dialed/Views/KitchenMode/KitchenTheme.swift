import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Kitchen Mode Theme

/// Glass card styling values for Kitchen Mode that don't have equivalents
/// in the app-wide color system. All other colors use `Color.app*` tokens.
///
/// Values adapt to light/dark mode automatically.
enum KitchenTheme {

    // MARK: Card Glass Fills & Borders

    /// Hero card glass fill — slightly more prominent than compact.
    static let cardFill = Color.adaptive(light: Color.black.opacity(0.03), dark: Color.white.opacity(0.10))

    /// Hero card glass border.
    static let cardBorder = Color.adaptive(light: Color.black.opacity(0.08), dark: Color.white.opacity(0.15))

    /// Compact card glass fill — subtle.
    static let compactCardFill = Color.adaptive(light: Color.black.opacity(0.02), dark: Color.white.opacity(0.06))

    /// Compact card glass border.
    static let compactCardBorder = Color.adaptive(light: Color.black.opacity(0.05), dark: Color.white.opacity(0.08))

    // MARK: Input Fields

    /// Background for text fields inside glass cards.
    static let fieldBackground = Color.adaptive(light: Color.black.opacity(0.04), dark: Color.white.opacity(0.08))
}

// MARK: - Adaptive Color Helper

private extension Color {
    /// Creates a color that adapts to the current color scheme.
    static func adaptive(light: Color, dark: Color) -> Color {
        #if canImport(UIKit)
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(dark)
                : UIColor(light)
        })
        #else
        light
        #endif
    }
}
