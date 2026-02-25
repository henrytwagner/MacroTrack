/**
 * Result of a barcode scan. GTIN is normalized to 13-digit (e.g. UPC-A zero-padded).
 */
export type BarcodeScanResult = {
  /** 13-digit GTIN (normalized from raw). */
  gtin: string;
  /** Raw barcode string as read by the scanner. */
  raw: string;
  /** Barcode format (e.g. ean13, upc_a, ean8). */
  format: string;
};
