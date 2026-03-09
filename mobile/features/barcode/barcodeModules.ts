/**
 * Encode GTIN digits into a sequence of bar/space modules (0 = space, 1 = bar)
 * for EAN-8, UPC-A, and EAN-13. Used to render a live barcode preview as the user types.
 */

const GUARD = "101";
const CENTER = "01010";

// 7-module encoding: L (left odd), G (left even), R (right). Index = digit 0-9.
const L: readonly string[] = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const G: readonly string[] = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];
const R: readonly string[] = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];

// EAN-13: first digit (0-9) → which of the 6 left digits use L (false) or G (true).
// "LLGLGG" means position 0,1=L; 2=G; 3=L; 4,5=G.
const EAN13_PARITY: readonly string[] = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

function encodeDigitL(d: number): string {
  return L[d] ?? "";
}
function encodeDigitG(d: number): string {
  return G[d] ?? "";
}
function encodeDigitR(d: number): string {
  return R[d] ?? "";
}

function digitAt(s: string, i: number): number {
  const c = s[i];
  return c === undefined ? -1 : parseInt(c, 10);
}

/**
 * Returns a string of "0" (space) and "1" (bar) modules for the given digits.
 * Handles EAN-8 (8 digits), UPC-A (12 digits), EAN-13 (13 digits), and partial
 * input so the barcode appears to build left-to-right as the user types.
 * @param digits - Digits only (no separators).
 * @returns Module sequence or "" if digits empty.
 */
export function digitsToModuleSequence(digits: string): string {
  const d = digits.replace(/\D/g, "");
  const len = d.length;
  if (len === 0) return "";

  // 8 digits → full EAN-8
  if (len === 8) {
    let out = GUARD;
    for (let i = 0; i < 4; i++) out += encodeDigitL(digitAt(d, i));
    out += CENTER;
    for (let i = 4; i < 8; i++) out += encodeDigitR(digitAt(d, i));
    out += GUARD;
    return out;
  }

  // 12 digits → full UPC-A (left 6 L, right 6 R)
  if (len === 12) {
    let out = GUARD;
    for (let i = 0; i < 6; i++) out += encodeDigitL(digitAt(d, i));
    out += CENTER;
    for (let i = 6; i < 12; i++) out += encodeDigitR(digitAt(d, i));
    out += GUARD;
    return out;
  }

  // 13 digits → full EAN-13 (left 6 by parity of first digit, right 6 R)
  if (len === 13) {
    const parity = EAN13_PARITY[digitAt(d, 0)] ?? "LLLLLL";
    let out = GUARD;
    for (let i = 0; i < 6; i++) {
      const digit = digitAt(d, i + 1);
      out += parity[i] === "G" ? encodeDigitG(digit) : encodeDigitL(digit);
    }
    out += CENTER;
    for (let i = 7; i < 13; i++) out += encodeDigitR(digitAt(d, i));
    out += GUARD;
    return out;
  }

  // Partial: build left-to-right
  if (len >= 1 && len <= 4) {
    // EAN-8 style left only
    let out = GUARD;
    for (let i = 0; i < len; i++) out += encodeDigitL(digitAt(d, i));
    return out;
  }

  if (len >= 5 && len <= 7) {
    // UPC-A style: guard + up to 6 L, then center + 1 R only when we have 7 digits
    let out = GUARD;
    const leftCount = Math.min(len, 6);
    for (let i = 0; i < leftCount; i++) out += encodeDigitL(digitAt(d, i));
    if (len >= 7) {
      out += CENTER;
      out += encodeDigitR(digitAt(d, 6));
    }
    return out;
  }

  if (len >= 9 && len <= 11) {
    // UPC-A: guard + 6 L + center + (len-6) R
    let out = GUARD;
    for (let i = 0; i < 6; i++) out += encodeDigitL(digitAt(d, i));
    out += CENTER;
    for (let i = 6; i < len; i++) out += encodeDigitR(digitAt(d, i));
    return out;
  }

  // 7 < len < 8 or 11 < len < 12 or len > 13: treat as UPC-A partial (e.g. 7 already done above)
  if (len > 13) {
    // Cap at 13 for display: show EAN-13 of first 13 digits
    return digitsToModuleSequence(d.slice(0, 13));
  }

  return "";
}
