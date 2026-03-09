import { normalizeToGTIN } from "../barcode";

describe("barcode route normalizeToGTIN", () => {
  it("returns 13-digit as-is when check digit valid", () => {
    expect(normalizeToGTIN("0123456789012")).toBe("0123456789012");
  });

  it("zero-pads 12-digit to 13", () => {
    expect(normalizeToGTIN("123456789012")).toBe("0123456789012");
  });

  it("strips non-digits", () => {
    expect(normalizeToGTIN("012-345-678-9012")).toBe("0123456789012");
  });

  it("returns empty string for no digits", () => {
    expect(normalizeToGTIN("abc")).toBe("");
  });

  it("returns null for invalid length", () => {
    expect(normalizeToGTIN("123")).toBeNull();
    expect(normalizeToGTIN("12345678901234")).toBeNull();
  });

  it("returns null for 11-digit", () => {
    expect(normalizeToGTIN("12345678901")).toBeNull();
  });

  it("returns null for invalid check digit", () => {
    expect(normalizeToGTIN("0123456789013")).toBeNull();
  });

  it("expands UPC-E to 13-digit when format upc_e", () => {
    expect(normalizeToGTIN("02345673", "upc_e")).toBe("0023456000073");
  });

  it("normalizes format (e.g. upc-e to upc_e)", () => {
    expect(normalizeToGTIN("02345673", "upc-e")).toBe("0023456000073");
  });
});
