import Foundation

/// Parse a raw BLE notification packet from an Etekcity ESN00 nutrition scale.
///
/// Confirmed byte layout (28-row empirical dataset, 2026-03-18):
///   B0, B1: Header — 0xFE 0xEF
///   B4, B5: Stability flag — 0xD0 0x05 when stable
///   B6: Sign — 0=positive, 1=negative
///   B7, B8: Weight mantissa, big-endian → raw = (B7 << 8) | B8
///   B9: Unit — 0x00=g, 0x01=lb:oz, 0x02=ml, 0x04=ml-density, 0x06=oz
///   Divisor: g/ml → 10, oz/lb:oz → 100
func parseEtekcityPacket(_ data: Data) -> ScaleReading? {
    guard data.count >= 10 else { return nil }
    guard data[0] == 0xFE, data[1] == 0xEF else { return nil }

    let rawHex = data.map { String(format: "%02X", $0) }.joined(separator: " ")

    let stable = data[4] == 0xD0 && data[5] == 0x05

    let negative = data[6] == 0x01
    let raw = (Int(data[7]) << 8) | Int(data[8])
    let unitByte = data[9]

    let unit: ScaleUnit
    var value: Double
    let display: String
    let sign = negative ? "-" : ""

    switch unitByte {
    case 0x00:
        unit = .g
        value = Double(raw) / 10.0
        display = "\(sign)\(Int(value.rounded())) g"

    case 0x02, 0x04:
        // 0x02 = ml, 0x04 = ml with density compensation (water-drop mode)
        unit = .ml
        value = Double(raw) / 10.0
        display = "\(sign)\(Int(value.rounded())) ml"

    case 0x06:
        unit = .oz
        value = Double(raw) / 100.0
        display = "\(sign)\(String(format: "%.1f", value)) oz"

    case 0x01:
        unit = .lbOz
        let totalOz = Double(raw) / 100.0
        let lbs = Int(totalOz / 16)
        let ozRem = totalOz - Double(lbs) * 16
        value = Double(lbs) + ozRem / 16
        display = "\(sign)\(lbs) lb \(String(format: "%.1f", ozRem)) oz"

    default:
        // Unknown unit byte — fall back to grams
        unit = .g
        value = Double(raw) / 10.0
        display = "\(sign)\(Int(value.rounded())) g"
    }

    if negative { value = -value }

    return ScaleReading(value: value, unit: unit, display: display, stable: stable, rawHex: rawHex)
}
