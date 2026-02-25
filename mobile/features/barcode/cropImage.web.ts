/**
 * Web: crop image to a region using canvas.
 * Crop coordinates are in original image pixel space (origin top-left).
 * Returns a blob URL; caller should revoke it when done to avoid leaks.
 */

/** No-op on web; normalization is for native system-crop URIs. */
export function normalizeImageForScan(uri: string): Promise<string> {
  return Promise.resolve(uri);
}

export type CropRegion = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = uri;
  });
}

const MAX_CROP_DIM = 2000;

/**
 * Scale down source dimensions so the crop canvas never exceeds MAX_CROP_DIM on
 * the longest side. Avoids main-thread stalls on large images (decode + toBlob).
 */
function scaleRegionToMaxDim(
  imgWidth: number,
  imgHeight: number,
  region: CropRegion
): { scale: number; region: CropRegion } {
  const maxSrc = Math.max(imgWidth, imgHeight);
  if (maxSrc <= MAX_CROP_DIM) {
    return { scale: 1, region };
  }
  const scale = MAX_CROP_DIM / maxSrc;
  return {
    scale,
    region: {
      originX: region.originX * scale,
      originY: region.originY * scale,
      width: region.width * scale,
      height: region.height * scale,
    },
  };
}

export async function cropImageToRegion(
  uri: string,
  region: CropRegion
): Promise<string> {
  const img = await loadImage(uri);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const { scale, region: scaledRegion } = scaleRegionToMaxDim(iw, ih, region);
  const { originX, originY, width, height } = scaledRegion;
  const x = Math.round(originX);
  const y = Math.round(originY);
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d context not available");
  if (scale < 1) {
    const sw = Math.round(iw * scale);
    const sh = Math.round(ih * scale);
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = sw;
    tempCanvas.height = sh;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) throw new Error("Canvas 2d context not available");
    tempCtx.drawImage(img, 0, 0, iw, ih, 0, 0, sw, sh);
    ctx.drawImage(tempCanvas, x, y, w, h, 0, 0, w, h);
  } else {
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("toBlob failed"));
          return;
        }
        resolve(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.92
    );
  });
}
