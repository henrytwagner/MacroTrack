import { normalizeToGTIN } from "../gtin";

describe("normalizeToGTIN", () => {
  it("returns 13-digit string unchanged", () => {
    expect(normalizeToGTIN("0123456789012")).toBe("0123456789012");
    expect(normalizeToGTIN("1234567890123")).toBe("1234567890123");
  });

  it("left-pads 12-digit string with one 0", () => {
    expect(normalizeToGTIN("012345678901")).toBe("0012345678901");
    expect(normalizeToGTIN("123456789012")).toBe("0123456789012");
  });

  it("strips non-digits before normalizing", () => {
    expect(normalizeToGTIN("0 12-345-678-901")).toBe("0012345678901"); // 12 digits → padded
    expect(normalizeToGTIN("0123456789012 ")).toBe("0123456789012"); // 13 digits → as-is
  });

  it("returns empty string when no digits", () => {
    expect(normalizeToGTIN("")).toBe("");
    expect(normalizeToGTIN("abc")).toBe("");
    expect(normalizeToGTIN("---")).toBe("");
  });

  it("throws for invalid lengths (not 12 or 13 digits)", () => {
    expect(() => normalizeToGTIN("123")).toThrow(/Invalid barcode length/);
    expect(() => normalizeToGTIN("12345678901")).toThrow(/Invalid barcode length/);
    expect(() => normalizeToGTIN("12345678901234")).toThrow(/Invalid barcode length/);
    expect(() => normalizeToGTIN("12345")).toThrow(/expected 12 or 13/);
  });

  it("accepts optional format parameter without affecting result", () => {
    expect(normalizeToGTIN("0123456789012", "ean13")).toBe("0123456789012");
    expect(normalizeToGTIN("012345678901", "upc_a")).toBe("0012345678901");
  });
});
