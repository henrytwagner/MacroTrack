import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
} from "@zxing/library";

/** Expand 8-digit UPC-E to 12-digit UPC-A (zero-suppression rules). */
function expandUPCEtoUPCA(upce: string): string {
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

export function normalizeToGTIN(raw: string, format?: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const len = digits.length;
  if (len === 13) return digits;
  if (len === 12) return "0" + digits;
  if (len === 8) {
    if (format === "upc_e") {
      const upca = expandUPCEtoUPCA(digits);
      return upca.length === 12 ? "0" + upca : "00000" + digits;
    }
    return "00000" + digits;
  }
  if (len === 0) return "";
  return null;
}

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

export async function barcodeRoutes(app: FastifyInstance) {
  app.post("/api/barcode/scan", async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ gtin: null });
    }
    const buffer = await data.toBuffer();
    if (buffer.length === 0) {
      return reply.code(200).send({ gtin: null });
    }
    try {
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
      if (!result || !result.getText()) {
        return reply.code(200).send({ gtin: null });
      }
      const raw = result.getText();
      const formatStr = zxingFormatToStr(result.getBarcodeFormat());
      const gtin = normalizeToGTIN(raw, formatStr);
      if (!gtin) {
        return reply.code(200).send({ gtin: null });
      }
      return reply.code(200).send({ gtin, raw, format: formatStr });
    } catch {
      return reply.code(200).send({ gtin: null });
    }
  });
}
