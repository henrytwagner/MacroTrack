/**
 * Stub for non-web platforms. The real implementation is in scanFromImageWeb.web.ts
 * so that native bundles do not pull in @zxing/library or DOM APIs.
 */
import type { BarcodeScanResult } from "./types";

export async function scanFromImageWeb(_uri: string): Promise<BarcodeScanResult | null> {
  return null;
}
