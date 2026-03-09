const CANONICAL_FORMATS = ["ean13", "upc_a", "ean8", "upc_e"] as const;
type CanonicalFormat = (typeof CANONICAL_FORMATS)[number];

/**
 * Normalize format string from scanner/decoder to canonical lowercase underscore form.
 * Ensures we never miss upc_e due to casing or hyphen (e.g. UPC_E, upc-e → upc_e).
 */
export function normalizeFormat(format: string | undefined): CanonicalFormat | undefined {
  if (format == null || format === "") return undefined;
  const normalized = format.toLowerCase().replace(/-/g, "_");
  if (CANONICAL_FORMATS.includes(normalized as CanonicalFormat)) {
    return normalized as CanonicalFormat;
  }
  return undefined;
}

/**
 * Validate GTIN check digit (mod-10, GS1 standard).
 * For 13-digit: weights 1,3,1,3,... from left for first 12 digits; (sum + checkDigit) mod 10 === 0.
 * Same formula applies to 12-digit (UPC-A) and 8-digit when used in their context.
 */
export function validateGTINCheckDigit(gtin13: string): boolean {
  if (gtin13.length !== 13 || !/^\d{13}$/.test(gtin13)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(gtin13[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  return (sum + parseInt(gtin13[12], 10)) % 10 === 0;
}

/** Validate 12-digit UPC-A check digit (GS1: weights 3,1,3,1,... for positions 1–11, position 12 is check). */
export function validateUPCACheckDigit(upca12: string): boolean {
  if (upca12.length !== 12 || !/^\d{12}$/.test(upca12)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += parseInt(upca12[i], 10) * (i % 2 === 0 ? 3 : 1);
  }
  sum += parseInt(upca12[11], 10);
  return sum % 10 === 0;
}

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
 * Rejects 11-digit (ambiguous). Validates check digit on result; throws if invalid.
 * @param raw - Raw barcode string (e.g. from scanner).
 * @param format - Optional format hint (ean13, upc_a, ean8, upc_e); normalized via normalizeFormat.
 * @returns 13-digit GTIN string (check-digit valid).
 * @throws Error for invalid lengths (not 8, 12, or 13 digits), or invalid check digit.
 */
export function normalizeToGTIN(raw: string, format?: string): string {
  const digits = raw.replace(/\D/g, "");
  const len = digits.length;
  const fmt = normalizeFormat(format);

  if (len === 0) return "";

  if (len === 11) {
    throw new Error(`Invalid barcode length for GTIN: 11 digits (expected 8, 12 or 13)`);
  }
  if (len !== 8 && len !== 12 && len !== 13) {
    throw new Error(`Invalid barcode length for GTIN: ${len} digits (expected 8, 12 or 13)`);
  }

  let gtin13: string;

  if (len === 13) {
    gtin13 = digits;
  } else if (len === 12) {
    gtin13 = "0" + digits;
  } else {
    // 8-digit: EAN-8 vs UPC-E
    if (fmt === "upc_e") {
      const upca = expandUPCEtoUPCA(digits);
      if (upca.length !== 12 || !validateUPCACheckDigit(upca)) {
        throw new Error("Invalid check digit (UPC-E expansion invalid)");
      }
      gtin13 = "0" + upca;
    } else if (fmt === "ean8") {
      gtin13 = "00000" + digits;
    } else {
      // Format unknown: disambiguate by check digit
      const upca = expandUPCEtoUPCA(digits);
      const asUPCE = upca.length === 12 && validateUPCACheckDigit(upca);
      const gtinUPCE = asUPCE ? "0" + upca : null;
      const gtinEAN8 = "00000" + digits;
      const upceValid = gtinUPCE != null && validateGTINCheckDigit(gtinUPCE);
      const ean8Valid = validateGTINCheckDigit(gtinEAN8);
      if (upceValid && !ean8Valid) gtin13 = gtinUPCE!;
      else if (!upceValid && ean8Valid) gtin13 = gtinEAN8;
      else if (upceValid && ean8Valid) {
        gtin13 = digits[0] === "0" || digits[0] === "1" ? gtinUPCE! : gtinEAN8;
      } else {
        throw new Error("Invalid check digit (unrecognized 8-digit barcode)");
      }
    }
  }

  if (gtin13.length === 13 && !validateGTINCheckDigit(gtin13)) {
    throw new Error("Invalid check digit");
  }
  return gtin13;
}

export type ValidateGTINResult =
  | { valid: true; gtin: string }
  | { valid: false; error?: string };

/**
 * Validate user input for manual GTIN entry. Safe for as-you-type validation (no throw).
 * Uses same normalization and check-digit validation as normalizeToGTIN; returns valid only when
 * the resulting 13-digit GTIN passes check digit.
 * @param value - Raw input (digits and optional separators).
 * @returns valid: true with normalized 13-digit GTIN, or valid: false with optional error message.
 */
export function validateGTINInput(value: string): ValidateGTINResult {
  const digits = value.replace(/\D/g, "");
  const len = digits.length;

  if (len === 0) return { valid: false };
  if (len !== 8 && len !== 12 && len !== 13) {
    return {
      valid: false,
      error: `Invalid length: ${len} digits (need 8, 12, or 13)`,
    };
  }
  try {
    const format =
      len === 8 && (digits[0] === "0" || digits[0] === "1") ? "upc_e" : len === 8 ? "ean8" : undefined;
    const gtin = normalizeToGTIN(value, format);
    return { valid: true, gtin };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid barcode";
    return { valid: false, error: message };
  }
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
