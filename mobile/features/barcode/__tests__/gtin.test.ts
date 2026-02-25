import {
  normalizeToGTIN,
  expandUPCEtoUPCA,
  validateGTINInput,
  inferFormatFromLength,
  inferFormatForManualEntry,
} from "../gtin";

describe("normalizeToGTIN", () => {
  it("returns 13-digit string unchanged", () => {
    expect(normalizeToGTIN("0123456789012")).toBe("0123456789012");
    expect(normalizeToGTIN("1234567890123")).toBe("1234567890123");
  });

  it("left-pads 12-digit string with one 0", () => {
    expect(normalizeToGTIN("012345678901")).toBe("0012345678901");
    expect(normalizeToGTIN("123456789012")).toBe("0123456789012");
  });

  it("left-pads 8-digit string with five 0s (EAN-8)", () => {
    expect(normalizeToGTIN("12345678")).toBe("0000012345678");
    expect(normalizeToGTIN("01234567")).toBe("0000001234567");
  });

  it("strips non-digits before normalizing", () => {
    expect(normalizeToGTIN("0 12-345-678-901")).toBe("0012345678901"); // 12 digits → padded
    expect(normalizeToGTIN("0123456789012 ")).toBe("0123456789012"); // 13 digits → as-is
    expect(normalizeToGTIN("12-34-56-78")).toBe("0000012345678"); // 8 digits → padded
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

  it("accepts optional format parameter without affecting result", () => {
    expect(normalizeToGTIN("0123456789012", "ean13")).toBe("0123456789012");
    expect(normalizeToGTIN("012345678901", "upc_a")).toBe("0012345678901");
    expect(normalizeToGTIN("12345678", "ean8")).toBe("0000012345678");
  });

  it("expands UPC-E (8-digit) to 13-digit GTIN when format is upc_e", () => {
    // Diet Coke–style: UPC-E 04904500 → UPC-A 049000000450 → GTIN 0049000000450
    expect(normalizeToGTIN("04904500", "upc_e")).toBe("0049000000450");
    // E[6]=7 (5-9 pattern): E[0..6] + "0000" + E[6..8] → 023456000073
    expect(normalizeToGTIN("02345673", "upc_e")).toBe("0023456000073");
    // E[6]=0 (0-2 pattern): E[0..3] + E[6] + "0000" + E[3..6] + E[7] → 078000003239
    expect(normalizeToGTIN("07832309", "upc_e")).toBe("0078000003239");
  });
});

describe("expandUPCEtoUPCA", () => {
  it("expands 8-digit UPC-E to 12-digit UPC-A by pattern", () => {
    expect(expandUPCEtoUPCA("02345673")).toBe("023456000073"); // E[6]=7 → 5-9
    expect(expandUPCEtoUPCA("02345147")).toBe("023450000017");  // E[6]=4 → case 4
    expect(expandUPCEtoUPCA("04904500")).toBe("049000000450");  // E[6]=0
  });
});

describe("validateGTINInput", () => {
  it("returns valid: false when empty or no digits", () => {
    expect(validateGTINInput("")).toEqual({ valid: false });
    expect(validateGTINInput("abc")).toEqual({ valid: false });
    expect(validateGTINInput("---")).toEqual({ valid: false });
  });

  it("returns valid: true with gtin for 8, 12, or 13 digits", () => {
    expect(validateGTINInput("012345678901")).toEqual({ valid: true, gtin: "0012345678901" });
    expect(validateGTINInput("0123456789012")).toEqual({ valid: true, gtin: "0123456789012" });
  });

  it("treats 8-digit starting with 0 or 1 as UPC-E (expanded GTIN), others as EAN-8", () => {
    expect(validateGTINInput("04904500")).toEqual({ valid: true, gtin: "0049000000450" });
    expect(validateGTINInput("12345678")).toEqual({ valid: true, gtin: "0123456000078" });
    expect(validateGTINInput("82345678")).toEqual({ valid: true, gtin: "0000082345678" });
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
    expect(validateGTINInput("04 90 45 00")).toEqual({ valid: true, gtin: "0049000000450" });
    expect(validateGTINInput("82 34 56 78")).toEqual({ valid: true, gtin: "0000082345678" });
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
