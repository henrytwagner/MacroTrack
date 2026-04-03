@preconcurrency import AVFoundation
import Foundation

// MARK: - GTINNormalizer

/// Shared barcode normalization utility.
/// Faithful port of `mobile/features/barcode/gtin.ts`.
///
/// All barcodes flowing to the server or stored locally must pass through
/// `normalizeToGTIN` to ensure consistent GTIN-13 format.
///
/// All methods are `nonisolated static` so they can be called from any
/// isolation domain (camera session queue, MainActor, etc.).
enum GTINNormalizer {

    // MARK: - Public API

    /// Normalize a raw barcode string to 13-digit GTIN.
    ///
    /// - 13-digit (EAN-13): returned as-is
    /// - 12-digit (UPC-A): padded with leading "0"
    /// - 8-digit with format "upc_e": expanded to UPC-A, then padded
    /// - 8-digit with format "ean8" (or no format): padded with five leading "0"s
    /// - 8-digit with no format: disambiguated using first-digit heuristic
    /// - Other lengths: returned as raw digits (passthrough for Code128, QR, etc.)
    ///
    /// No check digit validation — hardware scanners already validate.
    nonisolated static func normalizeToGTIN(_ raw: String, format: String? = nil) -> String {
        let digits = raw.filter(\.isNumber)
        let len = digits.count
        let fmt = normalizeFormat(format)

        if len == 0 { return "" }

        if len == 13 {
            return digits
        }

        if len == 12 {
            return "0" + digits
        }

        if len == 8 {
            if fmt == "upc_e" {
                let upca = expandUPCEtoUPCA(digits)
                if upca.count == 12 {
                    return "0" + upca
                }
                // Expansion failed — fall through to EAN-8 padding
                return "00000" + digits
            } else if fmt == "ean8" {
                return "00000" + digits
            } else {
                // No format hint — disambiguate using first-digit heuristic
                // (matches RN `inferFormatForManualEntry`: 0 or 1 → UPC-E, else EAN-8)
                if digits.first == "0" || digits.first == "1" {
                    let upca = expandUPCEtoUPCA(digits)
                    if upca.count == 12 {
                        return "0" + upca
                    }
                }
                return "00000" + digits
            }
        }

        // Non-standard length — reject (not a valid GTIN)
        return ""
    }

    /// Convenience overload for `AVCaptureMetadataOutput` barcode types.
    nonisolated static func normalizeToGTIN(_ raw: String, type: AVMetadataObject.ObjectType) -> String {
        let format: String?
        switch type {
        case .ean8:  format = "ean8"
        case .ean13: format = "ean13"
        case .upce:  format = "upc_e"
        default:     format = nil
        }
        return normalizeToGTIN(raw, format: format)
    }

    // MARK: - UPC-E Expansion

    /// Expand 8-digit UPC-E to 12-digit UPC-A.
    /// Faithful port of `expandUPCEtoUPCA` from `gtin.ts`.
    ///
    /// Works on the full 8-digit string using slice-based indexing:
    /// - e[0] = number system, e[1..6] = compressed digits, e[7] = check digit
    /// - e[6] is the "switch digit" that determines the expansion pattern
    nonisolated static func expandUPCEtoUPCA(_ upce: String) -> String {
        let e = Array(upce)
        guard e.count == 8 else { return upce }

        switch e[6] {
        case "0", "1", "2":
            // e[0..3] + e[6] + "0000" + e[3..6] + e[7]
            return String(e[0..<3]) + String(e[6]) + "0000" + String(e[3..<6]) + String(e[7])
        case "3":
            // e[0..4] + "00000" + e[4..6] + e[7]
            return String(e[0..<4]) + "00000" + String(e[4..<6]) + String(e[7])
        case "4":
            // e[0..5] + "00000" + e[5] + e[7]
            return String(e[0..<5]) + "00000" + String(e[5]) + String(e[7])
        case "5", "6", "7", "8", "9":
            // e[0..6] + "0000" + e[6..8]
            return String(e[0..<6]) + "0000" + String(e[6..<8])
        default:
            return upce
        }
    }

    // MARK: - Format Helpers

    /// Normalize a format string to canonical form.
    /// Port of `normalizeFormat` from `gtin.ts`.
    nonisolated private static func normalizeFormat(_ format: String?) -> String? {
        guard let format, !format.isEmpty else { return nil }
        let normalized = format.lowercased().replacingOccurrences(of: "-", with: "_")
        let canonical = ["ean13", "upc_a", "ean8", "upc_e"]
        return canonical.contains(normalized) ? normalized : nil
    }
}
