"use node";

import sharp from "sharp";
import type { Id } from "../_generated/dataModel";

export interface LoadedImage {
  name: string;
  data: Uint8Array;
  mediaType: "image/png";
}

const MAX_SIDE_PX = 1568;
const MIN_SIDE_PX = 280;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;

async function fitForJev(source: Uint8Array): Promise<Uint8Array | null> {
  const image = sharp(source, { animated: false });
  const { width, height, format } = await image.metadata();
  if (format !== "png" && format !== "jpeg") return null;
  if (width === undefined || height === undefined) return null;
  const shrink = Math.min(1, MAX_SIDE_PX / Math.max(width, height));
  const grow = Math.max(1, MIN_SIDE_PX / (Math.min(width, height) * shrink));
  const scale = shrink * grow;
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);
  if (Math.max(targetWidth, targetHeight) > MAX_SIDE_PX) return null;
  const output = await image
    .resize({ width: targetWidth, height: targetHeight, fit: "fill" })
    .png()
    .toBuffer();
  return new Uint8Array(output);
}

/**
 * Loads each stored image and fits it for Jev. Missing files, non-image
 * blobs and shapes Jev cannot take come back in `skipped` by name rather than
 * failing the call, so a caller can judge what did load.
 */
export async function loadImages(
  storage: { get(storageId: Id<"_storage">): Promise<Blob | null> },
  refs: readonly { name: string; storageId: Id<"_storage"> }[],
): Promise<{ images: LoadedImage[]; skipped: string[] }> {
  const images: LoadedImage[] = [];
  const skipped: string[] = [];
  for (const ref of refs) {
    const blob = await storage.get(ref.storageId);
    if (blob === null || blob.size > MAX_SOURCE_BYTES) {
      skipped.push(ref.name);
      continue;
    }
    try {
      const data = await fitForJev(new Uint8Array(await blob.arrayBuffer()));
      if (data === null) {
        skipped.push(ref.name);
        continue;
      }
      images.push({ name: ref.name, data, mediaType: "image/png" });
    } catch (error) {
      console.error("[jev] image unreadable", ref.name, error);
      skipped.push(ref.name);
    }
  }
  return { images, skipped };
}
