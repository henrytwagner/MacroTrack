# Barcode test fixtures

Put an image containing a barcode here to test the server decode locally.

**Example:** Save your image as `barcode-test.jpg`, then run:

```bash
cd server && npx tsx scripts/decode-barcode-from-file.ts
```

Or pass any path:

```bash
npx tsx server/scripts/decode-barcode-from-file.ts path/to/your-image.jpg
```

The script uses the same decode logic as the `/api/barcode/scan` endpoint (sharp + ZXing). If it finds a barcode, it prints `{ gtin, raw, format }`. If it prints "No barcode found", the issue is with the image or decode; if it succeeds here but the app still fails, the issue is upload or client-side.
