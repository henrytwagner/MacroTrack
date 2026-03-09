# Option B implementation: Upload image only

This document is the **implementation plan for Option B (hybrid)** for the "Upload image" barcode flow. Camera scanning is unchanged.

---

## Chosen approach: Option B — upload image only

- **Web**: Client-side decode (load image → canvas → ImageData → @zxing/library). Fast; no server.
- **Android**: Keep expo-camera `scanFromURLAsync(uri)`. No server.
- **iOS**: Upload image to `POST /api/barcode/scan`; server returns `{ gtin, raw, format }`.

---

## Implementation

### 1. Client: scanFromImage platform branching

**File**: [mobile/features/barcode/scanner.ts](mobile/features/barcode/scanner.ts)

- **scanFromImage(uri, options?)** — extend to accept optional `{ type?, name? }` for the iOS upload path:
  - **Platform.OS === 'web'**: Call a new client-side decode helper (step 2). Pass the image URI. Return `BarcodeScanResult | null`. No server call.
  - **Platform.OS === 'android'**: Keep existing logic: `scanFromURLAsync(uri, barcodeTypes)` then normalize with `toBarcodeScanResult`. No server call.
  - **Platform.OS === 'ios'**: Call the API helper that uploads the image (step 4). POST to `BASE_URL/api/barcode/scan`, parse response, return `BarcodeScanResult | null`.
- Callers (e.g. barcode-demo) pass asset info from expo-image-picker when available so the iOS path can build FormData with uri, type, name.

### 2. Client: web-only decode helper (canvas + ZXing)

**New file**: e.g. `mobile/features/barcode/scanFromImageWeb.ts` (or inside scanner.ts behind `Platform.OS === 'web'`).

- **Input**: Image URI (blob URL or object URL from picker).
- **Steps**: (1) Load image into `Image`, set `src = uri`, await onload. (2) Draw to offscreen canvas (same dimensions). (3) `ctx.getImageData(0,0,w,h)` for RGBA. (4) Pass to @zxing/library: `RGBLuminanceSource` with width, height, byte array (convert RGBA to luminance if required by the API). (5) `MultiFormatReader` with hints `EAN_13`, `UPC_A`, `EAN_8`; map result format to `ean13`/`upc_a`/`ean8`. (6) Normalize with `normalizeToGTIN(raw, format)`; return `{ gtin, raw, format }` or null.
- **Dependency**: Add `@zxing/library` to [mobile/package.json](mobile/package.json). Use only in web path (platform guard or separate file so native bundles do not pull it unnecessarily).

### 3. Server: barcode scan endpoint (iOS only)

**New file**: `server/src/routes/barcode.ts`; register in [server/src/app.ts](server/src/app.ts).

- **Route**: `POST /api/barcode/scan`. Accept one image via multipart (field `image`). Use **@fastify/multipart**.
- **Decode**: Read file to buffer. **sharp**: `sharp(buffer).raw().toBuffer({ resolveWithObject: true })` for `{ data, info: { width, height, channels } }`; ensure RGB. **@zxing/library**: `RGBLuminanceSource`, `BinaryBitmap` + `HybridBinarizer`, `MultiFormatReader` with `EAN_13`, `UPC_A`, `EAN_8`; map format to `ean13`/`upc_a`/`ean8`. Apply same GTIN rules as [mobile/features/barcode/gtin.ts](mobile/features/barcode/gtin.ts). Return 200 with `{ gtin, raw, format }` on success; 200 with `{ gtin: null }` or 404 on no barcode.
- **Dependencies**: Add `sharp`, `@fastify/multipart`, `@zxing/library` to [server/package.json](server/package.json).

### 4. Client: API helper for iOS image upload

**File**: [mobile/services/api.ts](mobile/services/api.ts).

- **New function**: e.g. `uploadImageForBarcodeScan(uri: string, type?: string, name?: string): Promise<BarcodeScanResult | null>`. Build FormData (append `{ uri, type: type ?? 'image/jpeg', name: name ?? 'image.jpg' }` on RN). POST to `${BASE_URL}/api/barcode/scan`. Parse JSON; return `BarcodeScanResult` if gtin/raw/format present, else null. On network/5xx return null.
- **scanner.ts** iOS path calls this with the picked asset's uri, type, name.

### 5. Barcode demo / callers

**File**: [mobile/app/barcode-demo.tsx](mobile/app/barcode-demo.tsx). When calling `scanFromImage`, pass the full asset when available (e.g. `assets[0]`) so the iOS path receives uri, type, name for the multipart request. Extend `scanFromImage` signature to `scanFromImage(uri: string, options?: { type?: string; name?: string })` if needed.

### 6. Docs and rules

- Update [.cursor/rules/barcode-scanner.mdc](.cursor/rules/barcode-scanner.mdc): "Upload image" — web and Android use client-side decode (web: canvas + ZXing; Android: expo-camera). iOS uses `POST /api/barcode/scan`. Camera scanning remains native/fallback only.

### 7. Tests

- **Server**: Unit test the decode route or pure decode function: buffer with known barcode (or mocked sharp + ZXing); assert `{ gtin, raw, format }` and normalization; no-barcode returns null/404.
- **Client**: In [mobile/features/barcode/__tests__/scanner.test.ts](mobile/features/barcode/__tests__/scanner.test.ts), mock iOS upload API and web decode helper per platform; assert Android path uses expo-camera; success → `BarcodeScanResult`, failure → `null`.

---

## Summary

| Area | Change |
|------|--------|
| Client scanner | `scanFromImage` branches: web → canvas+ZXing helper, Android → expo-camera, iOS → upload to server |
| Client web | New helper: load image → canvas → ZXing; add @zxing/library to mobile |
| Client API | New `uploadImageForBarcodeScan(uri, type?, name?)` in api.ts for iOS |
| Server | New `POST /api/barcode/scan` (multipart), sharp + @zxing/library, GTIN normalization |
| Barcode rule | Document Option B: client decode on web/Android, server on iOS for upload image |
| Tests | Server decode test; scanner test mocks per platform for scanFromImage |
