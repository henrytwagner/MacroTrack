import Foundation

/// App-wide configuration resolved from xcconfig → Info.plist → Bundle.main.
///
/// How it works:
/// - Debug.xcconfig / Release.xcconfig define API_HOST and API_SCHEME
/// - Info.plist contains $(API_HOST) / $(API_SCHEME) — substituted at build time
/// - Bundle.main.object(forInfoDictionaryKey:) reads the substituted values at runtime
///
/// To update the debug server address: edit MacroTrackerSwift/Debug.xcconfig.
/// The fallback (#if DEBUG) is only used if the plist keys are missing/empty.
nonisolated enum Config {
    static let baseURL: String = {
        #if targetEnvironment(simulator)
        // Simulator shares the Mac's network stack — localhost always works.
        return "http://localhost:3000"
        #else
        // Physical device — read IP from Debug.xcconfig / Release.xcconfig via Info.plist.
        if let scheme = Bundle.main.object(forInfoDictionaryKey: "API_SCHEME") as? String,
           let host   = Bundle.main.object(forInfoDictionaryKey: "API_HOST")   as? String,
           !scheme.isEmpty, !host.isEmpty {
            return "\(scheme)://\(host)"
        }
        #if DEBUG
        return "http://localhost:3000"
        #else
        return "https://api.macrotrack.app"
        #endif
        #endif
    }()
}
