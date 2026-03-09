/**
 * Native (iOS/Android): crop image to a region using expo-image-manipulator.
 * Crop coordinates are in original image pixel space (origin top-left).
 */
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/**
 * Load the image and re-save as JPEG. Use after the system crop so we get a
 * normal file:// URI and format the server can read (fixes "image not processed correctly").
 * Uses maximum quality (compress: 1) so barcode detail is preserved for decoding.
 */
export async function normalizeImageForScan(uri: string): Promise<string> {
  const imageRef = await ImageManipulator.manipulate(uri).renderAsync();
  const saveResult = await imageRef.saveAsync({
    format: SaveFormat.JPEG,
    compress: 1,
  });
  return saveResult.uri;
}

export type CropRegion = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

export type RotationDegrees = 0 | 90 | 180 | 270;

export async function cropImageToRegion(
  uri: string,
  region: CropRegion,
  rotationDegrees?: RotationDegrees
): Promise<string> {
  const cropAction = {
    originX: Math.round(region.originX),
    originY: Math.round(region.originY),
    width: Math.round(region.width),
    height: Math.round(region.height),
  };
  let pipeline = ImageManipulator.manipulate(uri);
  if (rotationDegrees && rotationDegrees !== 0) {
    pipeline = pipeline.rotate(rotationDegrees);
  }
  const result = await pipeline.crop(cropAction).renderAsync();
  const saveResult = await result.saveAsync({
    format: SaveFormat.JPEG,
    compress: 1,
  });
  return saveResult.uri;
}
