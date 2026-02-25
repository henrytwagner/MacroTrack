/**
 * Expand 8-digit UPC-E to 12-digit UPC-A (standard zero-suppression rules).
 * Used so we can normalize to 13-digit GTIN as "0" + UPC-A.
 */
export function expandUPCEtoUPCA(upce: string): string {
  if (upce.length !== 8) return upce;
  const e = upce;
  switch (e[6]) {
    case "0":
    case "1":
    case "2":
      return e.slice(0, 3) + e[6] + "0000" + e.slice(3, 6) + e[7];
    case "3":
      return e.slice(0, 4) + "00000" + e.slice(4, 6) + e[7];
    case "4":
      return e.slice(0, 5) + "00000" + e[5] + e[7];
    case "5":
    case "6":
    case "7":
    case "8":
    case "9":
      return e.slice(0, 6) + "0000" + e.slice(6, 8);
    default:
      return upce;
  }
}

/**
 * Normalize a barcode string to 13-digit GTIN.
 * Strips non-digits; 8-digit (EAN-8) left-padded with five '0's; 8-digit (UPC-E) expanded to UPC-A then one '0'; 12-digit (UPC-A) with one '0'; 13-digit (EAN-13) as-is.
 * @param raw - Raw barcode string (e.g. from scanner).
 * @param format - Optional format hint (ean13, upc_a, ean8, upc_e, etc.); when "upc_e", 8-digit is expanded to UPC-A then to GTIN.
 * @returns 13-digit GTIN string.
 * @throws Error for invalid lengths (not 8, 12, or 13 digits after stripping).
 */
export function normalizeToGTIN(raw: string, format?: string): string {
  const digits = raw.replace(/\D/g, "");
  const len = digits.length;

  if (len === 13) {
    return digits;
  }
  if (len === 12) {
    return "0" + digits;
  }
  if (len === 8) {
    if (format === "upc_e") {
      const upca = expandUPCEtoUPCA(digits);
      return upca.length === 12 ? "0" + upca : "00000" + digits;
    }
    return "00000" + digits;
  }

  if (len === 0) {
    return "";
  }

  throw new Error(`Invalid barcode length for GTIN: ${len} digits (expected 8, 12 or 13)`);
}

export type ValidateGTINResult =
  | { valid: true; gtin: string }
  | { valid: false; error?: string };

/**
 * Validate user input for manual GTIN entry. Safe for as-you-type validation (no throw).
 * For 8-digit input, the system cannot know if the user meant EAN-8 or UPC-E. We use a heuristic:
 * if the first digit is 0 or 1 (valid UPC-E number system digits), we treat it as UPC-E and expand
 * to the corresponding 13-digit GTIN; otherwise we treat it as EAN-8 (left-pad with five zeros).
 * @param value - Raw input (digits and optional separators).
 * @returns valid: true with normalized 13-digit GTIN, or valid: false with optional error message.
 */
export function validateGTINInput(value: string): ValidateGTINResult {
  const digits = value.replace(/\D/g, "");
  const len = digits.length;

  if (len === 0) {
    return { valid: false };
  }
  if (len === 12 || len === 13) {
    return { valid: true, gtin: normalizeToGTIN(value) };
  }
  if (len === 8) {
    const format =
      digits[0] === "0" || digits[0] === "1" ? "upc_e" : undefined;
    return { valid: true, gtin: normalizeToGTIN(value, format) };
  }
  return {
    valid: false,
    error: `Invalid length: ${len} digits (need 8, 12, or 13)`,
  };
}

export type GTINFormat = "ean8" | "upc_a" | "ean13" | "upc_e";

/**
 * Infer barcode format from digit count (after stripping non-digits).
 */
export function inferFormatFromLength(digitCount: number): GTINFormat {
  if (digitCount === 8) return "ean8";
  if (digitCount === 12) return "upc_a";
  return "ean13";
}

/**
 * Infer format for manual entry when length is 8: use UPC-E if first digit is 0 or 1 (US/Canada),
 * otherwise EAN-8. For 12/13 digits same as inferFormatFromLength.
 */
export function inferFormatForManualEntry(digits: string): GTINFormat {
  if (digits.length === 8) {
    return digits[0] === "0" || digits[0] === "1" ? "upc_e" : "ean8";
  }
  return inferFormatFromLength(digits.length);
}
