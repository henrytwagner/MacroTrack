/**
 * Web-only: decode barcode from image URI using canvas + @zxing/library.
 * Used when Platform.OS === 'web' for the "Upload image" flow.
 */
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
} from "@zxing/library";
import type { BarcodeScanResult } from "./types";
import { normalizeToGTIN } from "./gtin";

const HINTS = new Map();
HINTS.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.UPC_A,
  BarcodeFormat.EAN_8,
]);

function rgbaToLuminance(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const size = width * height;
  const out = new Uint8ClampedArray(size);
  for (let i = 0; i < size; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    out[i] = (r + g + g + b) / 4;
  }
  return out;
}

function zxingFormatToOurs(format: BarcodeFormat): string {
  switch (format) {
    case BarcodeFormat.EAN_13:
      return "ean13";
    case BarcodeFormat.UPC_A:
      return "upc_a";
    case BarcodeFormat.EAN_8:
      return "ean8";
    default:
      return String(format).toLowerCase().replace(/_/g, "_");
  }
}

const MAX_DIM = 1200;

function decodeFromLuminance(
  luminance: Uint8ClampedArray,
  width: number,
  height: number,
): BarcodeScanResult | null {
  try {
    const source = new RGBLuminanceSource(luminance, width, height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const reader = new MultiFormatReader();
    const result = reader.decode(bitmap, HINTS);
    if (!result || !result.getText()) return null;
    const raw = result.getText();
    const formatStr = zxingFormatToOurs(result.getBarcodeFormat());
    const gtin = normalizeToGTIN(raw, formatStr);
    if (!gtin) return null;
    return { gtin, raw, format: formatStr };
  } catch {
    return null;
  }
}

export async function scanFromImageWeb(uri: string): Promise<BarcodeScanResult | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!uri.startsWith("data:") && !uri.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) {
            h = Math.round((h * MAX_DIM) / w);
            w = MAX_DIM;
          } else {
            w = Math.round((w * MAX_DIM) / h);
            h = MAX_DIM;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const drawCtx = canvas.getContext("2d");
        if (!drawCtx) {
          resolve(null);
          return;
        }
        drawCtx.drawImage(img, 0, 0, w, h);
        const imageData = drawCtx.getImageData(0, 0, w, h);
        const luminance = rgbaToLuminance(imageData.data, w, h);
        let result = decodeFromLuminance(luminance, w, h);
        if (result) {
          resolve(result);
          return;
        }
        if (w >= 400 && h >= 400) {
          const halfW = Math.floor(w / 2);
          const halfH = Math.floor(h / 2);
          const smallCanvas = document.createElement("canvas");
          smallCanvas.width = halfW;
          smallCanvas.height = halfH;
          const smallCtx = smallCanvas.getContext("2d");
          if (smallCtx) {
            smallCtx.drawImage(canvas, 0, 0, halfW, halfH, 0, 0, halfW, halfH);
            const smallData = smallCtx.getImageData(0, 0, halfW, halfH);
            const smallLum = rgbaToLuminance(smallData.data, halfW, halfH);
            result = decodeFromLuminance(smallLum, halfW, halfH);
          }
        }
        resolve(result);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = uri;
  });
}
