/**
 * Normalize a barcode string to 13-digit GTIN.
 * Strips non-digits; 8-digit (EAN-8) left-padded with five '0's; 12-digit (UPC-A) with one '0'; 13-digit (EAN-13) as-is.
 * @param raw - Raw barcode string (e.g. from scanner).
 * @param format - Optional format hint (ean13, upc_a, ean8, etc.); used only for validation context.
 * @returns 13-digit GTIN string.
 * @throws Error for invalid lengths (not 8, 12, or 13 digits after stripping).
 */
export function normalizeToGTIN(raw: string, _format?: string): string {
  const digits = raw.replace(/\D/g, "");
  const len = digits.length;

  if (len === 13) {
    return digits;
  }
  if (len === 12) {
    return "0" + digits;
  }
  if (len === 8) {
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
 * @param value - Raw input (digits and optional separators).
 * @returns valid: true with normalized 13-digit GTIN, or valid: false with optional error message.
 */
export function validateGTINInput(value: string): ValidateGTINResult {
  const digits = value.replace(/\D/g, "");
  const len = digits.length;

  if (len === 0) {
    return { valid: false };
  }
  if (len === 8 || len === 12 || len === 13) {
    return { valid: true, gtin: normalizeToGTIN(value) };
  }
  return {
    valid: false,
    error: `Invalid length: ${len} digits (need 8, 12, or 13)`,
  };
}

export type GTINFormat = "ean8" | "upc_a" | "ean13";

/**
 * Infer barcode format from digit count (after stripping non-digits).
 */
export function inferFormatFromLength(digitCount: number): GTINFormat {
  if (digitCount === 8) return "ean8";
  if (digitCount === 12) return "upc_a";
  return "ean13";
}
