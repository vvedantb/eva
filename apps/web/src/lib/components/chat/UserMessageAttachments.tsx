import { useState } from "react";
import { toast } from "@eva/ui";
import {
  iconForAttachment,
  isImageContentType,
  labelForAttachment,
} from "@/lib/components/attachments/attachmentMeta";
import { TextAttachmentModal } from "@/lib/components/attachments/TextAttachmentModal";
import { ImageLightbox } from "@/lib/components/ImageLightbox";
import { ListEnter } from "@/lib/components/ui/ListEnter";

export type ChatAttachmentMeta = {
  url: string | null;
  contentType: string | null;
};

/** Renders a user message's attachments — image thumbs or text file chips. */
export function UserMessageAttachments({
  attachments,
}: {
  attachments?: ChatAttachmentMeta[];
}) {
  const [viewer, setViewer] = useState<{
    title: string;
    text: string;
  } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const resolved = (attachments ?? []).filter(
    (item): item is { url: string; contentType: string | null } =>
      Boolean(item.url),
  );
  if (resolved.length === 0 && viewer === null) return null;

  // Only the images take part in the lightbox, so a thumb's gallery position is
  // its index among images, not among all attachments.
  const galleryImages = resolved
    .filter((item) => isImageContentType(item.contentType))
    .map((item) => ({ url: item.url, alt: "Attached image" }));

  return (
    <>
      {resolved.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {resolved.map((item, index) => {
            if (isImageContentType(item.contentType)) {
              const galleryIndex = galleryImages.findIndex(
                (image) => image.url === item.url,
              );
              return (
                <ListEnter key={item.url} index={index} fast>
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(galleryIndex)}
                    className="block size-24 cursor-pointer overflow-hidden rounded-surface border border-border bg-muted motion-press active:scale-[0.99]"
                  >
                    <img
                      src={item.url}
                      alt="Attached image"
                      className="size-full object-cover transition-opacity hover:opacity-90"
                    />
                  </button>
                </ListEnter>
              );
            }
            const FileIcon = iconForAttachment(undefined, item.contentType);
            const label = labelForAttachment(undefined, item.contentType);
            return (
              <ListEnter key={item.url} index={index} fast>
                <button
                  type="button"
                  className="flex max-w-56 items-center gap-2 rounded-surface border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/80"
                  onClick={() => {
                    void (async () => {
                      try {
                        const response = await fetch(item.url);
                        if (!response.ok) {
                          toast.error("Could not load attachment.");
                          return;
                        }
                        const text = await response.text();
                        setViewer({ title: label, text });
                      } catch {
                        toast.error("Could not load attachment.");
                      }
                    })();
                  }}
                >
                  <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{label}</span>
                </button>
              </ListEnter>
            );
          })}
        </div>
      ) : null}

      <ImageLightbox
        images={galleryImages}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />

      {viewer ? (
        <TextAttachmentModal
          title={viewer.title}
          text={viewer.text}
          readOnly
          onClose={() => setViewer(null)}
        />
      ) : null}
    </>
  );
}
