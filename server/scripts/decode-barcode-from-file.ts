/**
 * Run the same barcode decode logic as the API on a local image file.
 * Run from repo root (not from mobile/ or server/):
 *   npx tsx server/scripts/decode-barcode-from-file.ts [path/to/image.jpg]
 * If no path is given, uses server/fixtures/barcode-test.png (or .jpg)
 *
 * Put your test image in server/fixtures/ (e.g. barcode-test.jpg) to verify decode.
 */
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
} from "@zxing/library";
import { normalizeToGTIN } from "../src/routes/barcode";

function zxingFormatToStr(format: BarcodeFormat): string {
  switch (format) {
    case BarcodeFormat.EAN_13:
      return "ean13";
    case BarcodeFormat.UPC_A:
      return "upc_a";
    case BarcodeFormat.EAN_8:
      return "ean8";
    case BarcodeFormat.UPC_E:
      return "upc_e";
    default:
      return String(format).toLowerCase();
  }
}

async function decodeFromBuffer(buffer: Buffer): Promise<{ gtin: string; raw: string; format: string } | null> {
  if (buffer.length === 0) return null;
  const maxDim = 1200;
  let pipeline = sharp(buffer).rotate().ensureAlpha();
  const meta = await pipeline.metadata();
  let width = meta.width ?? 0;
  let height = meta.height ?? 0;
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      pipeline = pipeline.resize(maxDim, Math.round((height * maxDim) / width));
    } else {
      pipeline = pipeline.resize(Math.round((width * maxDim) / height), maxDim);
    }
  }
  const { data: rawBuffer, info } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true });
  width = info.width;
  height = info.height;
  const channels = info.channels ?? 4;
  const luminance = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rawBuffer[i * channels];
    const g = rawBuffer[i * channels + 1];
    const b = rawBuffer[i * channels + 2];
    luminance[i] = (r + g + g + b) / 4;
  }
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.UPC_A,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_E,
  ]);
  const source = new RGBLuminanceSource(luminance, width, height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  const reader = new MultiFormatReader();
  let result = reader.decode(bitmap, hints);
  if (!result || !result.getText()) {
    if (width >= 400 && height >= 400) {
      const halfW = Math.floor(width / 2);
      const halfH = Math.floor(height / 2);
      const halfLum = new Uint8ClampedArray(halfW * halfH);
      for (let y = 0; y < halfH; y++) {
        for (let x = 0; x < halfW; x++) {
          const src = (y * 2) * width + x * 2;
          halfLum[y * halfW + x] = luminance[src];
        }
      }
      const src2 = new RGBLuminanceSource(halfLum, halfW, halfH);
      const bmp2 = new BinaryBitmap(new HybridBinarizer(src2));
      result = reader.decode(bmp2, hints);
    }
  }
  if (!result || !result.getText()) return null;
  const raw = result.getText();
  const formatStr = zxingFormatToStr(result.getBarcodeFormat());
  const gtin = normalizeToGTIN(raw, formatStr);
  if (!gtin) return null;
  return { gtin, raw, format: formatStr };
}

async function main() {
  const fixturesDir = path.join(__dirname, "..", "fixtures");
  const imagePath = process.argv[2] ?? path.join(fixturesDir, "barcode-test.png");
  let resolved = path.resolve(imagePath);
  if (!fs.existsSync(resolved) && !process.argv[2]) {
    resolved = path.resolve(path.join(fixturesDir, "barcode-test.jpg"));
  }
  if (!fs.existsSync(resolved)) {
    console.error("File not found:", path.resolve(imagePath));
    console.error("Usage: npx tsx server/scripts/decode-barcode-from-file.ts [path/to/image.png]");
    console.error("Put your test image in server/fixtures/barcode-test.png or pass a path.");
    process.exit(1);
  }
  const buffer = fs.readFileSync(resolved);
  console.log("Image:", resolved, "size:", buffer.length, "bytes");
  try {
    const result = await decodeFromBuffer(buffer);
    if (result) {
      console.log("Decoded:", JSON.stringify(result, null, 2));
    } else {
      console.log("No barcode found.");
    }
  } catch (err) {
    console.error("Decode error:", err);
    process.exit(1);
  }
}

main();
