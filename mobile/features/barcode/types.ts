/**
 * Result of a barcode scan.
 * GTIN is canonical 13-digit, check-digit validated, and suitable for real-world product identification (lookup, storage, external APIs). Use `raw` for display (e.g. 8-digit as printed).
 */
export type BarcodeScanResult = {
  /** 13-digit GTIN (normalized from raw; check-digit valid). */
  gtin: string;
  /** Raw barcode string as read by the scanner. */
  raw: string;
  /** Barcode format (e.g. ean13, upc_a, ean8, upc_e). */
  format: string;
};
