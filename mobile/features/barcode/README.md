# Barcode scanner (standalone)

This module is developed **independently** of the main MacroTrack app. It is not wired into the Log tab or Kitchen Mode yet.

## Public API (when implemented)

- **`scanWithCamera()`** — Opens the camera scanner (iOS/Android only). Returns `Promise<BarcodeScanResult | null>`.
- **`scanFromImage(uri: string)`** — Scans a barcode from an image URI (all platforms). Returns `Promise<BarcodeScanResult | null>`.

Result shape: `{ gtin: string; raw: string; format: string }`.

**GTIN contract**: `gtin` is always a **canonical 13-digit** identifier, validated with the standard mod-10 check digit. Use it for storage, lookup, and any external APIs (e.g. product databases, Open Food Facts). Use `raw` when you need to show “what’s on the package” (e.g. 8-digit UPC-E as printed). A successful result implies the GTIN passes check-digit validation.

## Scope

- Camera: iOS and Android only (native `launchScanner()` when available, fallback in-app camera with target overlay).
- Image upload: All platforms (web, iOS, Android).
- Demo: Reachable via the "Barcode demo" button on the Dashboard (dev entry point).

## Testing

Unit tests live in `__tests__/` (e.g. `gtin.test.ts`, `scanner.test.ts`). Run from the repo: `cd mobile && npm test`. When changing this feature, add or update tests as needed; see `.cursor/rules/barcode-scanner.mdc` for testing guidance.

See BUILD_GUIDE.md → "Standalone: Barcode Scanner" for full scope and validation steps.
