import SwiftUI

// MARK: - Typography Scale (port of mobile/constants/theme.ts Typography)
//
// Line height is applied at call sites via .lineSpacing() / .leading().
// Tracking values below match the RN letterSpacing values exactly.

public extension Font {
    // fontSize: 34, weight: .bold, tracking: 0.37
    static let appLargeTitle = Font.system(size: 34, weight: .bold)

    // fontSize: 28, weight: .bold, tracking: 0.36
    static let appTitle1 = Font.system(size: 28, weight: .bold)

    // fontSize: 22, weight: .bold, tracking: 0.35
    static let appTitle2 = Font.system(size: 22, weight: .bold)

    // fontSize: 20, weight: .semibold, tracking: 0.38
    static let appTitle3 = Font.system(size: 20, weight: .semibold)

    // fontSize: 17, weight: .semibold, tracking: -0.41
    static let appHeadline = Font.system(size: 17, weight: .semibold)

    // fontSize: 17, weight: .regular, tracking: -0.41
    static let appBody = Font.system(size: 17, weight: .regular)

    // fontSize: 16, weight: .regular, tracking: -0.32
    static let appCallout = Font.system(size: 16, weight: .regular)

    // fontSize: 15, weight: .regular, tracking: -0.24
    static let appSubhead = Font.system(size: 15, weight: .regular)

    // fontSize: 13, weight: .regular, tracking: -0.08
    static let appFootnote = Font.system(size: 13, weight: .regular)

    // fontSize: 12, weight: .regular, tracking: 0
    static let appCaption1 = Font.system(size: 12, weight: .regular)

    // fontSize: 11, weight: .regular, tracking: 0.07
    static let appCaption2 = Font.system(size: 11, weight: .regular)
}

// MARK: - Tracking Values
//
// Apply with .tracking(Typography.Tracking.largeTitle) at call sites.

public enum Typography {
    public enum Tracking {
        public static let largeTitle: CGFloat =  0.37
        public static let title1:     CGFloat =  0.36
        public static let title2:     CGFloat =  0.35
        public static let title3:     CGFloat =  0.38
        public static let headline:   CGFloat = -0.41
        public static let body:       CGFloat = -0.41
        public static let callout:    CGFloat = -0.32
        public static let subhead:    CGFloat = -0.24
        public static let footnote:   CGFloat = -0.08
        public static let caption1:   CGFloat =  0.00
        public static let caption2:   CGFloat =  0.07
    }

    public enum LineHeight {
        public static let largeTitle: CGFloat = 41
        public static let title1:     CGFloat = 34
        public static let title2:     CGFloat = 28
        public static let title3:     CGFloat = 25
        public static let headline:   CGFloat = 22
        public static let body:       CGFloat = 22
        public static let callout:    CGFloat = 21
        public static let subhead:    CGFloat = 20
        public static let footnote:   CGFloat = 18
        public static let caption1:   CGFloat = 16
        public static let caption2:   CGFloat = 13
    }
}
