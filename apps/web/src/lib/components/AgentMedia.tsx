"use client";

import { VideoPreview } from "@/lib/components/MediaPreview";
import { ImageGalleryPreview } from "@/lib/components/MediaGallery";

/** A resolved capture: `url` is null when the stored blob is gone. */
export type AgentMediaEntry = {
  url: string | null;
  contentType: string | null;
};

/**
 * Screenshots and recordings an agent left behind, rendered the one way Eva
 * renders them: videos as inline players, images collapsed into a single
 * gallery + lightbox so a screenshot-heavy turn is not a long vertical stack.
 *
 * Shared by chat replies (media on the message) and task run rows (media on the
 * run doc, which has no message to hang it off).
 */
export function AgentMedia({ entries }: { entries: AgentMediaEntry[] }) {
  const videos = entries.flatMap((entry) =>
    entry.url && entry.contentType?.startsWith("video/")
      ? [{ url: entry.url }]
      : [],
  );
  const images = entries.flatMap((entry) =>
    entry.url && !entry.contentType?.startsWith("video/")
      ? [{ url: entry.url }]
      : [],
  );

  return (
    <>
      {videos.map((video, index) => (
        // Capped to the same width `ImageGalleryPreview` uses, so a video and a
        // screenshot in the same reply line up instead of the video spanning
        // the whole pane.
        <VideoPreview key={index} url={video.url} className="max-w-lg" />
      ))}
      {images.length > 0 ? <ImageGalleryPreview images={images} /> : null}
    </>
  );
}
