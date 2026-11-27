"use client";

import { useState } from "react";
import {
  splitAgentMedia,
  type AgentMediaItem,
  type ResolvedMediaEntry,
} from "@eva/shared";
import { ImageLightbox } from "@vvedantb/ui";
import { cn } from "@eva/ui";

/** A resolved capture: `url` is null when the stored blob is gone. */
export type AgentMediaEntry = ResolvedMediaEntry;

/** Hairline ring that separates media from any surface, in light and dark. */
const MEDIA_OUTLINE = "ring-1 ring-black/10 dark:ring-white/10";

/**
 * Screenshots and recordings an agent left behind, rendered the one way Eva
 * renders them: each video as a plain browser player, then every image in one
 * carousel, each captioned with its file name.
 *
 * Shared by chat replies (media on the message) and task run rows (media on the
 * run doc, which has no message to hang it off).
 */
export function AgentMedia({ entries }: { entries: AgentMediaEntry[] }) {
  const { videos, images } = splitAgentMedia(entries);

  return (
    <>
      {videos.map((video, index) => (
        <figure key={index} className="flex max-w-lg flex-col gap-1.5">
          <MediaCaption caption={video.caption} />
          <video
            src={video.url}
            controls
            playsInline
            preload="metadata"
            className={cn(MEDIA_OUTLINE, "rounded-surface w-full")}
          />
        </figure>
      ))}
      <ImageCarousel images={images} />
    </>
  );
}

/**
 * All images in one row. One image keeps the old single-image width; two or
 * three share the row; more scroll sideways, three to a view.
 */
function ImageCarousel({ images }: { images: AgentMediaItem[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const count = images.length;
  if (count === 0) return null;

  return (
    <>
      <div
        className={cn(
          "flex items-start gap-2",
          count === 1 ? "max-w-lg" : "w-full",
          count > 3 &&
            "overflow-x-auto scrollbar scroll-fade-x snap-x snap-mandatory pb-1",
        )}
      >
        {images.map((image, index) => (
          <figure
            key={index}
            className={cn(
              "flex min-w-0 shrink-0 snap-start flex-col gap-1.5",
              count === 1 && "w-full",
              count === 2 && "basis-[calc((100%-0.5rem)/2)]",
              count >= 3 && "basis-[calc((100%-1rem)/3)]",
            )}
          >
            <MediaCaption caption={image.caption} />
            <button
              type="button"
              onClick={() => setLightboxIndex(index)}
              className="block motion-press active:scale-[0.99]"
            >
              <img
                src={image.url}
                alt={image.caption ?? `Screenshot ${index + 1}`}
                loading="lazy"
                className={cn(
                  MEDIA_OUTLINE,
                  "rounded-surface max-h-96 w-full cursor-pointer object-contain object-top transition-opacity hover:opacity-90",
                )}
              />
            </button>
          </figure>
        ))}
      </div>
      <ImageLightbox
        images={images.map((image) => ({
          url: image.url,
          alt: image.caption ?? undefined,
        }))}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  );
}

function MediaCaption({ caption }: { caption: string | null }) {
  if (!caption) return null;
  return (
    <figcaption className="truncate text-sm text-muted-foreground">
      {caption}
    </figcaption>
  );
}
