"use client";

import { useState } from "react";
import { cn } from "@eva/ui";
import {
  ImageLightbox,
  type GalleryImage,
} from "@/lib/components/ImageLightbox";

export type { GalleryImage };

/**
 * Twitter-style image gallery for chat messages: up to a 2x2 grid of cropped
 * tiles (a "+N" overlay on the fourth when more exist) instead of a long
 * stack, opening the shared `ImageLightbox`. Videos are rendered separately
 * (VideoPreview) — this is images only.
 */
export function ImageGalleryPreview({ images }: { images: GalleryImage[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const count = images.length;
  if (count === 0) return null;

  const tiles = images.slice(0, 4);
  const overflow = count - tiles.length;

  return (
    <>
      {count === 1 ? (
        <button
          type="button"
          onClick={() => setLightboxIndex(0)}
          className="block max-w-lg motion-press active:scale-[0.99]"
        >
          <img
            src={images[0]?.url}
            alt={images[0]?.alt ?? "Screenshot"}
            loading="lazy"
            className="media-outline rounded-surface max-h-96 max-w-full cursor-pointer transition-opacity hover:opacity-90"
          />
        </button>
      ) : (
        <div
          className={cn(
            "media-outline rounded-surface grid max-w-lg gap-0.5 overflow-hidden",
            "grid-cols-2",
          )}
        >
          {tiles.map((image, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setLightboxIndex(index)}
              className={cn(
                "relative block cursor-pointer motion-press active:scale-[0.99]",
                // Three images: first tile spans the left column, Twitter-style.
                count === 3 && index === 0 ? "row-span-2 h-full" : undefined,
              )}
            >
              <img
                src={image.url}
                alt={image.alt ?? `Screenshot ${index + 1}`}
                loading="lazy"
                className={cn(
                  "h-full w-full object-cover transition-opacity hover:opacity-90",
                  count === 3 && index === 0 ? "min-h-full" : "aspect-4/3",
                )}
              />
              {overflow > 0 && index === tiles.length - 1 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xl font-semibold text-white">
                  +{overflow}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      <ImageLightbox
        images={images}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  );
}
