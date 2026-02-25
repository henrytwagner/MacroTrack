import { normalizeToGTIN, validateGTINInput, inferFormatFromLength } from "../gtin";

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
});

describe("validateGTINInput", () => {
  it("returns valid: false when empty or no digits", () => {
    expect(validateGTINInput("")).toEqual({ valid: false });
    expect(validateGTINInput("abc")).toEqual({ valid: false });
    expect(validateGTINInput("---")).toEqual({ valid: false });
  });

  it("returns valid: true with gtin for 8, 12, or 13 digits", () => {
    expect(validateGTINInput("12345678")).toEqual({ valid: true, gtin: "0000012345678" });
    expect(validateGTINInput("012345678901")).toEqual({ valid: true, gtin: "0012345678901" });
    expect(validateGTINInput("0123456789012")).toEqual({ valid: true, gtin: "0123456789012" });
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
    expect(validateGTINInput("12 34 56 78")).toEqual({ valid: true, gtin: "0000012345678" });
  });
});

describe("inferFormatFromLength", () => {
  it("returns ean8 for 8, upc_a for 12, ean13 for 13", () => {
    expect(inferFormatFromLength(8)).toBe("ean8");
    expect(inferFormatFromLength(12)).toBe("upc_a");
    expect(inferFormatFromLength(13)).toBe("ean13");
  });
});
