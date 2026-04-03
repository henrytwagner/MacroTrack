import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

// MARK: - Adaptive Color Helper

private extension Color {
    /// Creates a color that adapts to light/dark mode using hex values.
    init(lightHex: UInt32, darkHex: UInt32) {
        #if canImport(UIKit)
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(hex: darkHex)
                : UIColor(hex: lightHex)
        })
        #elseif canImport(AppKit)
        self.init(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            return isDark ? NSColor(hex: darkHex) : NSColor(hex: lightHex)
        })
        #else
        // Fallback: use light value
        let r = Double((lightHex >> 16) & 0xFF) / 255
        let g = Double((lightHex >>  8) & 0xFF) / 255
        let b = Double( lightHex        & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
        #endif
    }
}

#if canImport(UIKit)
private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red:   CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >>  8) & 0xFF) / 255,
            blue:  CGFloat( hex        & 0xFF) / 255,
            alpha: 1)
    }
}
#elseif canImport(AppKit)
private extension NSColor {
    convenience init(hex: UInt32) {
        self.init(
            red:   CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >>  8) & 0xFF) / 255,
            blue:  CGFloat( hex        & 0xFF) / 255,
            alpha: 1)
    }
}
#endif

// MARK: - Semantic Color Tokens (port of mobile/constants/theme.ts)

public extension Color {
    // Text
    static let appText           = Color(lightHex: 0x1C1C1E, darkHex: 0xF2F2F7)
    static let appTextSecondary  = Color(lightHex: 0x8E8E93, darkHex: 0x8E8E93)
    static let appTextTertiary   = Color(lightHex: 0xAEAEB2, darkHex: 0x636366)

    // Backgrounds
    static let appBackground         = Color(lightHex: 0xF2F2F7, darkHex: 0x000000)
    static let appSurface            = Color(lightHex: 0xFFFFFF, darkHex: 0x1C1C1E)
    static let appSurfaceSecondary   = Color(lightHex: 0xF5F5F7, darkHex: 0x2C2C2E)

    // Interactive
    static let appTint           = Color(lightHex: 0x007AFF, darkHex: 0x0A84FF)
    static let appIcon           = Color(lightHex: 0x8E8E93, darkHex: 0x8E8E93)
    static let appTabIconDefault = Color(lightHex: 0x8E8E93, darkHex: 0x8E8E93)
    static let appTabIconSelected = Color(lightHex: 0x007AFF, darkHex: 0x0A84FF)

    // Borders
    static let appBorder      = Color(lightHex: 0xE5E5EA, darkHex: 0x38383A)
    static let appBorderLight = Color(lightHex: 0xF0F0F2, darkHex: 0x2C2C2E)

    // Semantic
    static let appDestructive    = Color(lightHex: 0xFF3B30, darkHex: 0xFF453A)
    static let appSuccess        = Color(lightHex: 0x34C759, darkHex: 0x30D158)
    static let appWarning        = Color(lightHex: 0xFF9500, darkHex: 0xFF9F0A)
    static let appDialed         = Color(lightHex: 0x5856D6, darkHex: 0x5E5CE6)

    // Macro Accents
    static let caloriesAccent = Color(lightHex: 0xFF2D55, darkHex: 0xFF375F)
    static let proteinAccent  = Color(lightHex: 0x5856D6, darkHex: 0x5E5CE6)
    static let carbsAccent    = Color(lightHex: 0xFF9500, darkHex: 0xFF9F0A)
    static let fatAccent      = Color(lightHex: 0x30B0C7, darkHex: 0x40C8E0)

    // Progress
    static let progressTrack    = Color(lightHex: 0xE8E8ED, darkHex: 0x2C2C2E)
    static let progressOverflow = Color(lightHex: 0xFF3B30, darkHex: 0xFF453A)

    // Macro overflow colors — each accent channel × 0.75 (floor), capped 0–255
    static let caloriesOverflow = Color(lightHex: 0xBF213F, darkHex: 0xBF2947)
    static let proteinOverflow  = Color(lightHex: 0x4240A0, darkHex: 0x4645AC)
    static let carbsOverflow    = Color(lightHex: 0xBF6F00, darkHex: 0xBF7707)
    static let fatOverflow      = Color(lightHex: 0x248495, darkHex: 0x3096A8)

    // Misc
    static let appSheetHandle = Color(lightHex: 0xC7C7CC, darkHex: 0x48484A)
}

// MARK: - Spacing

public enum Spacing {
    public static let xs:   CGFloat = 4
    public static let sm:   CGFloat = 8
    public static let md:   CGFloat = 12
    public static let lg:   CGFloat = 16
    public static let xl:   CGFloat = 20
    public static let xxl:  CGFloat = 24
    public static let xxxl: CGFloat = 32
}

// MARK: - BorderRadius

public enum BorderRadius {
    public static let sm:   CGFloat = 8
    public static let md:   CGFloat = 12
    public static let lg:   CGFloat = 16
    public static let xl:   CGFloat = 20
    public static let full: CGFloat = 9999
}

// MARK: - Glass Effect

extension View {
    /// Applies glassEffect on iOS 26+; falls back to regularMaterial on earlier versions.
    @ViewBuilder
    func glassOrMaterial<S: Shape>(in shape: S) -> some View {
        if #available(iOS 26, *) {
            self.glassEffect(.regular.interactive(), in: shape)
        } else {
            self.background(.regularMaterial, in: shape)
        }
    }
}
