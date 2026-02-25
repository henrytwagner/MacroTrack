/**
 * Normalize a barcode string to 13-digit GTIN.
 * Strips non-digits; 12-digit (e.g. UPC-A) is left-padded with one '0'; 13-digit (e.g. EAN-13) returned as-is.
 * @param raw - Raw barcode string (e.g. from scanner).
 * @param format - Optional format hint (ean13, upc_a, ean8, etc.); used only for validation context.
 * @returns 13-digit GTIN string.
 * @throws Error for invalid lengths (not 12 or 13 digits after stripping).
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

  if (len === 0) {
    return "";
  }

  throw new Error(`Invalid barcode length for GTIN: ${len} digits (expected 12 or 13)`);
}
