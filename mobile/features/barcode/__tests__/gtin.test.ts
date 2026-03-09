import {
  normalizeToGTIN,
  expandUPCEtoUPCA,
  validateGTINInput,
  validateGTINCheckDigit,
  normalizeFormat,
  inferFormatFromLength,
  inferFormatForManualEntry,
} from "../gtin";

describe("normalizeToGTIN", () => {
  it("returns 13-digit string unchanged when check digit valid", () => {
    expect(normalizeToGTIN("0123456789012")).toBe("0123456789012");
  });

  it("left-pads 12-digit string with one 0", () => {
    expect(normalizeToGTIN("123456789012")).toBe("0123456789012");
  });

  it("left-pads 8-digit string with five 0s (EAN-8) when format is ean8", () => {
    // 22345677 has valid EAN-8 check digit when padded to 13
    expect(normalizeToGTIN("22345677", "ean8")).toBe("0000022345677");
  });

  it("strips non-digits before normalizing", () => {
    expect(normalizeToGTIN("1 23-456-789-012")).toBe("0123456789012");
    expect(normalizeToGTIN("0123456789012 ")).toBe("0123456789012");
    expect(normalizeToGTIN("22-34-56-77", "ean8")).toBe("0000022345677");
  });

  it("returns empty string when no digits", () => {
    expect(normalizeToGTIN("")).toBe("");
    expect(normalizeToGTIN("abc")).toBe("");
    expect(normalizeToGTIN("---")).toBe("");
  });

  it("throws for invalid lengths (not 8, 12 or 13 digits)", () => {
    expect(() => normalizeToGTIN("123")).toThrow(/Invalid barcode length/);
    expect(() => normalizeToGTIN("12345678901")).toThrow(/Invalid barcode length/);
    expect(() => normalizeToGTIN("12345678901234")).toThrow(/Invalid barcode length/);
    expect(() => normalizeToGTIN("12345")).toThrow(/expected 8, 12 or 13/);
  });

  it("throws for 11-digit (ambiguous length)", () => {
    expect(() => normalizeToGTIN("12345678901")).toThrow(/11 digits/);
  });

  it("accepts optional format parameter without affecting result", () => {
    expect(normalizeToGTIN("0123456789012", "ean13")).toBe("0123456789012");
    expect(normalizeToGTIN("123456789012", "upc_a")).toBe("0123456789012");
    expect(normalizeToGTIN("22345677", "ean8")).toBe("0000022345677");
  });

  it("expands UPC-E (8-digit) to 13-digit GTIN when format is upc_e", () => {
    // 02345673 expands to 023456000073 (valid UPC-A) → 0023456000073
    expect(normalizeToGTIN("02345673", "upc_e")).toBe("0023456000073");
  });

  it("treats 8-digit with unknown/missing format using check-digit disambiguation", () => {
    // 02345673: only UPC-E interpretation is valid → 0023456000073
    expect(normalizeToGTIN("02345673")).toBe("0023456000073");
    expect(normalizeToGTIN("02345673", "unknown")).toBe("0023456000073");
    // 22345677: EAN-8 format valid
    expect(normalizeToGTIN("22345677", "ean8")).toBe("0000022345677");
  });

  it("throws when check digit invalid (13-digit)", () => {
    expect(() => normalizeToGTIN("0123456789013")).toThrow(/Invalid check digit/);
  });

  it("throws when 8-digit has no valid interpretation", () => {
    // 99999999: neither UPC-E nor EAN-8 interpretation has valid check digit
    expect(() => normalizeToGTIN("99999999")).toThrow(/Invalid check digit|unrecognized 8-digit/);
  });
});

describe("validateGTINCheckDigit", () => {
  it("returns true for valid 13-digit GTIN", () => {
    expect(validateGTINCheckDigit("0123456789012")).toBe(true);
    expect(validateGTINCheckDigit("0023456000073")).toBe(true);
  });
  it("returns false for invalid check digit", () => {
    expect(validateGTINCheckDigit("0123456789013")).toBe(false);
  });
  it("returns false for wrong length or non-digits", () => {
    expect(validateGTINCheckDigit("123")).toBe(false);
    expect(validateGTINCheckDigit("01234567890123")).toBe(false);
    expect(validateGTINCheckDigit("012345678901a")).toBe(false);
  });
});

describe("normalizeFormat", () => {
  it("returns canonical format for known types", () => {
    expect(normalizeFormat("upc_e")).toBe("upc_e");
    expect(normalizeFormat("UPC_E")).toBe("upc_e");
    expect(normalizeFormat("upc-e")).toBe("upc_e");
    expect(normalizeFormat("ean8")).toBe("ean8");
    expect(normalizeFormat("EAN13")).toBe("ean13");
  });
  it("returns undefined for unknown or empty", () => {
    expect(normalizeFormat("unknown")).toBeUndefined();
    expect(normalizeFormat("")).toBeUndefined();
    expect(normalizeFormat(undefined)).toBeUndefined();
  });
});

describe("expandUPCEtoUPCA", () => {
  it("expands 8-digit UPC-E to 12-digit UPC-A by pattern", () => {
    expect(expandUPCEtoUPCA("02345673")).toBe("023456000073"); // E[6]=7 → 5-9
    expect(expandUPCEtoUPCA("02345147")).toBe("023450000017");  // E[6]=4 → case 4
    expect(expandUPCEtoUPCA("04904500")).toBe("049000000450");   // E[6]=0
    expect(expandUPCEtoUPCA("03424005")).toBe("034000002405");   // E[6]=0 → 0-2 pattern
  });
});

describe("validateGTINInput", () => {
  it("returns valid: false when empty or no digits", () => {
    expect(validateGTINInput("")).toEqual({ valid: false });
    expect(validateGTINInput("abc")).toEqual({ valid: false });
    expect(validateGTINInput("---")).toEqual({ valid: false });
  });

  it("returns valid: true with gtin for 8, 12, or 13 digits when check digit valid", () => {
    expect(validateGTINInput("123456789012")).toEqual({ valid: true, gtin: "0123456789012" });
    expect(validateGTINInput("0123456789012")).toEqual({ valid: true, gtin: "0123456789012" });
    expect(validateGTINInput("02345673")).toEqual({ valid: true, gtin: "0023456000073" });
    expect(validateGTINInput("22345677")).toEqual({ valid: true, gtin: "0000022345677" });
  });

  it("returns valid: false with error for invalid check digit", () => {
    expect(validateGTINInput("0123456789013")).toEqual({
      valid: false,
      error: "Invalid check digit",
    });
  });

  it("returns valid: false with error for invalid lengths", () => {
    expect(validateGTINInput("123")).toEqual({
      valid: false,
      error: "Invalid length: 3 digits (need 8, 12, or 13)",
    });
    expect(validateGTINInput("12345678901")).toEqual({
      valid: false,
      error: "Invalid length: 11 digits (need 8, 12, or 13)",
    });
    expect(validateGTINInput("12345678901234")).toEqual({
      valid: false,
      error: "Invalid length: 14 digits (need 8, 12, or 13)",
    });
  });

  it("strips non-digits before validating", () => {
    expect(validateGTINInput("02 34 56 73")).toEqual({ valid: true, gtin: "0023456000073" });
    expect(validateGTINInput("22-34-56-77")).toEqual({ valid: true, gtin: "0000022345677" });
  });
});

describe("inferFormatFromLength", () => {
  it("returns ean8 for 8, upc_a for 12, ean13 for 13", () => {
    expect(inferFormatFromLength(8)).toBe("ean8");
    expect(inferFormatFromLength(12)).toBe("upc_a");
    expect(inferFormatFromLength(13)).toBe("ean13");
  });
});

describe("inferFormatForManualEntry", () => {
  it("returns upc_e for 8 digits starting with 0 or 1, ean8 otherwise", () => {
    expect(inferFormatForManualEntry("04904500")).toBe("upc_e");
    expect(inferFormatForManualEntry("12345678")).toBe("upc_e");
    expect(inferFormatForManualEntry("82345678")).toBe("ean8");
  });
  it("returns upc_a for 12, ean13 for 13", () => {
    expect(inferFormatForManualEntry("012345678901")).toBe("upc_a");
    expect(inferFormatForManualEntry("0123456789012")).toBe("ean13");
  });
});
