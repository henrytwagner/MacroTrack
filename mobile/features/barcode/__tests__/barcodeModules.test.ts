import { digitsToModuleSequence } from "../barcodeModules";

describe("digitsToModuleSequence", () => {
  it("returns empty string for empty or non-digit input", () => {
    expect(digitsToModuleSequence("")).toBe("");
    expect(digitsToModuleSequence("abc")).toBe("");
    expect(digitsToModuleSequence("---")).toBe("");
  });

  it("strips non-digits before encoding", () => {
    expect(digitsToModuleSequence("1 2 3")).toBe(digitsToModuleSequence("123"));
  });

  describe("partial input (barcode builds as user types)", () => {
    it("1 digit: guard + 7 modules (one L-encoded digit)", () => {
      const s = digitsToModuleSequence("5");
      expect(s.length).toBe(3 + 7);
      expect(s.startsWith("101")).toBe(true);
      expect(s.slice(3).length).toBe(7);
    });

    it("6 digits: guard + 6×7 modules (UPC-A left only)", () => {
      const s = digitsToModuleSequence("123456");
      expect(s.length).toBe(3 + 6 * 7);
      expect(s.startsWith("101")).toBe(true);
    });

    it("7 digits: guard + 6×7 + center + 7 (UPC-A left + center + 1 R)", () => {
      const s = digitsToModuleSequence("1234567");
      expect(s.length).toBe(3 + 6 * 7 + 5 + 7);
      expect(s.startsWith("101")).toBe(true);
      expect(s.includes("01010")).toBe(true);
    });
  });

  describe("full EAN-8 (8 digits)", () => {
    it("has correct total length: guard(3) + 4×7 + center(5) + 4×7 + guard(3) = 67", () => {
      const s = digitsToModuleSequence("12345678");
      expect(s.length).toBe(67);
      expect(s.startsWith("101")).toBe(true);
      expect(s.endsWith("101")).toBe(true);
      expect(s.includes("01010")).toBe(true);
    });
  });

  describe("full UPC-A (12 digits)", () => {
    it("has correct total length: guard(3) + 6×7 + center(5) + 6×7 + guard(3) = 95", () => {
      const s = digitsToModuleSequence("012345678901");
      expect(s.length).toBe(95);
      expect(s.startsWith("101")).toBe(true);
      expect(s.endsWith("101")).toBe(true);
      expect(s.includes("01010")).toBe(true);
    });
  });

  describe("full EAN-13 (13 digits)", () => {
    it("has correct total length: 95 modules", () => {
      const s = digitsToModuleSequence("4006381333931");
      expect(s.length).toBe(95);
      expect(s.startsWith("101")).toBe(true);
      expect(s.endsWith("101")).toBe(true);
      expect(s.includes("01010")).toBe(true);
    });
  });

  describe("only 0 and 1 in output", () => {
    it("returns a string of only bar(1) and space(0) modules", () => {
      const s = digitsToModuleSequence("12345678");
      expect(s).toMatch(/^[01]+$/);
    });
  });
});
