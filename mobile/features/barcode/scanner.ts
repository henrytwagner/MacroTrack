import { Platform } from "react-native";
import { CameraView, scanFromURLAsync, Camera } from "expo-camera";
import type { ScanningResult } from "expo-camera";
import type { BarcodeScanResult } from "./types";
import { normalizeToGTIN } from "./gtin";
import { scanFromImageWeb } from "./scanFromImageWeb";
import { uploadImageForBarcodeScan } from "@/services/api";

const BARCODE_TYPES = ["ean13", "upc_a", "ean8", "upc_e"] as const;

/**
 * Returns whether the native modern barcode scanner (launchScanner) is available.
 * On web, always false. Use this to decide between scanWithCamera() and the fallback BarcodeCameraScreen.
 */
export function getSupportedFeatures(): { isModernBarcodeScannerAvailable: boolean } {
  if (Platform.OS === "web") {
    return { isModernBarcodeScannerAvailable: false };
  }
  return {
    isModernBarcodeScannerAvailable: CameraView.isModernBarcodeScannerAvailable,
  };
}

function toBarcodeScanResult(
  data: string,
  format: string
): BarcodeScanResult | null {
  try {
    const gtin = normalizeToGTIN(data, format);
    if (!gtin) return null;
    return { gtin, raw: data, format };
  } catch {
    return null;
  }
}

/**
 * Scan a barcode using the device camera (native scanner when available).
 * iOS/Android only; on web returns null.
 * Requests camera permission; if native modern scanner is available, launches it and resolves with the first scan (normalized to GTIN). Otherwise resolves with null (Chunk 2 adds fallback screen).
 */
export async function scanWithCamera(): Promise<BarcodeScanResult | null> {
  if (Platform.OS === "web") {
    return null;
  }

  const { status } = await Camera.requestCameraPermissionsAsync();
  if (status !== "granted") {
    return null;
  }

  if (!CameraView.isModernBarcodeScannerAvailable) {
    return null;
  }

  return new Promise<BarcodeScanResult | null>((resolve) => {
    const subscription = CameraView.onModernBarcodeScanned((event: ScanningResult) => {
      subscription.remove();
      const data = event.data ?? (event as { raw?: string }).raw ?? "";
      const format = event.type ?? "unknown";
      const result = toBarcodeScanResult(data, format);
      void CameraView.dismissScanner();
      resolve(result ?? null);
    });

    void CameraView.launchScanner({
      barcodeTypes: [...BARCODE_TYPES],
    }).catch(() => {
      subscription.remove();
      resolve(null);
    });
  });
}

export type ScanFromImageOptions = { type?: string; name?: string };

/**
 * Scan a barcode from an image URI (e.g. from image picker).
 * Web: client-side decode (canvas + ZXing). Android: expo-camera scanFromURLAsync.
 * iOS: upload image to server for decode (pass options.type and options.name when available).
 */
export async function scanFromImage(
  uri: string,
  options?: ScanFromImageOptions
): Promise<BarcodeScanResult | null> {
  if (Platform.OS === "web") {
    return scanFromImageWeb(uri);
  }
  if (Platform.OS === "ios") {
    return uploadImageForBarcodeScan(uri, options?.type, options?.name);
  }
  try {
    const results = await scanFromURLAsync(uri, [...BARCODE_TYPES]);
    const first = results[0];
    if (!first) return null;

    const data = first.data ?? (first as { raw?: string }).raw ?? "";
    const format = first.type ?? "unknown";
    return toBarcodeScanResult(data, format);
  } catch {
    return null;
  }
}
