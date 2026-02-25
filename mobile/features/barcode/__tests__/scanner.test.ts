/**
 * Scanner tests with mocked expo-camera and API. On iOS, scanFromImage uses
 * uploadImageForBarcodeScan; on Android it uses scanFromURLAsync. We test
 * result normalization and null handling per platform.
 */
let platformOS: "ios" | "android" | "web" = "ios";
jest.mock("react-native", () => ({
  Platform: {
    get OS() {
      return platformOS;
    },
  },
}));

jest.mock("expo-camera", () => ({
  scanFromURLAsync: jest.fn(),
}));

jest.mock("@/services/api", () => ({
  uploadImageForBarcodeScan: jest.fn(),
}));

import { scanFromImage } from "../scanner";

const { scanFromURLAsync } = require("expo-camera") as {
  scanFromURLAsync: jest.Mock;
};
const { uploadImageForBarcodeScan } = require("@/services/api") as {
  uploadImageForBarcodeScan: jest.Mock;
};

describe("scanFromImage (iOS path)", () => {
  beforeAll(() => {
    platformOS = "ios";
  });

  beforeEach(() => {
    uploadImageForBarcodeScan.mockReset();
  });

  it("calls uploadImageForBarcodeScan and returns null when server returns no barcode", async () => {
    uploadImageForBarcodeScan.mockResolvedValue(null);
    const result = await scanFromImage("file:///some/image.jpg");
    expect(result).toBeNull();
    expect(uploadImageForBarcodeScan).toHaveBeenCalledWith(
      "file:///some/image.jpg",
      undefined,
      undefined
    );
  });

  it("calls uploadImageForBarcodeScan with options and returns BarcodeScanResult", async () => {
    uploadImageForBarcodeScan.mockResolvedValue({
      gtin: "0123456789012",
      raw: "0123456789012",
      format: "ean13",
    });
    const result = await scanFromImage("file:///photo.jpg", {
      type: "image/jpeg",
      name: "photo.jpg",
    });
    expect(result).toEqual({
      gtin: "0123456789012",
      raw: "0123456789012",
      format: "ean13",
    });
    expect(uploadImageForBarcodeScan).toHaveBeenCalledWith(
      "file:///photo.jpg",
      "image/jpeg",
      "photo.jpg"
    );
  });

  it("returns null when uploadImageForBarcodeScan returns null", async () => {
    uploadImageForBarcodeScan.mockResolvedValue(null);
    const result = await scanFromImage("file:///photo.jpg");
    expect(result).toBeNull();
  });
});

describe("scanFromImage (Android path)", () => {
  beforeAll(() => {
    platformOS = "android";
  });

  beforeEach(() => {
    scanFromURLAsync.mockReset();
  });

  it("returns null when no barcodes detected", async () => {
    scanFromURLAsync.mockResolvedValue([]);
    const result = await scanFromImage("file:///some/image.jpg");
    expect(result).toBeNull();
    expect(scanFromURLAsync).toHaveBeenCalledWith(
      "file:///some/image.jpg",
      expect.arrayContaining(["ean13", "upc_a", "ean8"])
    );
  });

  it("returns BarcodeScanResult with normalized GTIN for 13-digit data", async () => {
    scanFromURLAsync.mockResolvedValue([
      { type: "ean13", data: "0123456789012", raw: "0123456789012" },
    ]);
    const result = await scanFromImage("file:///photo.jpg");
    expect(result).toEqual({
      gtin: "0123456789012",
      raw: "0123456789012",
      format: "ean13",
    });
  });

  it("returns BarcodeScanResult with zero-padded GTIN for 12-digit data", async () => {
    scanFromURLAsync.mockResolvedValue([
      { type: "upc_a", data: "123456789012", raw: "123456789012" },
    ]);
    const result = await scanFromImage("file:///photo.jpg");
    expect(result).toEqual({
      gtin: "0123456789012",
      raw: "123456789012",
      format: "upc_a",
    });
  });

  it("returns null when first result fails GTIN normalization", async () => {
    scanFromURLAsync.mockResolvedValue([
      { type: "qr", data: "https://example.com", raw: "https://example.com" },
    ]);
    const result = await scanFromImage("file:///photo.jpg");
    expect(result).toBeNull();
  });
});
