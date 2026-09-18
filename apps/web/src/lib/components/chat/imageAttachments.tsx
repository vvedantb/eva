import { type Id } from "@eva/backend";
import {
  usePromptInputAttachments,
  toast,
  type PromptInputMessage,
} from "@eva/ui";
import { IconX } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import {
  contentTypeForUpload,
  iconForAttachment,
  isAllowedAttachmentFile,
  labelForAttachment,
} from "@/lib/components/attachments/attachmentMeta";
import { TextAttachmentModal } from "@/lib/components/attachments/TextAttachmentModal";
import { useUploadBlobs } from "@/lib/components/attachments/useUploadBlobs";
import { UserMessageAttachments } from "@/lib/components/chat/UserMessageAttachments";

/**
 * Chat-specific attachment pieces. Files are pasted/dropped into the
 * prompt-input attachment context, uploaded to Convex storage on send,
 * materialized into the sandbox as `/tmp/eva-attachment-*`, and shown back on
 * the user message. The accept lists, limits, and labelling live in
 * `@/lib/components/attachments/attachmentMeta` and are re-exported here for
 * existing callers.
 */

export {
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENT_BYTES,
  IMAGE_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_ACCEPT,
  chatAttachmentErrorMessage,
} from "@/lib/components/attachments/attachmentMeta";

export { UserMessageAttachments };

/** What came back from an upload attempt: the ids that stuck, and what did not. */
export interface ChatAttachmentUploads {
  ids: Id<"_storage">[];
  /** Files the agent will never see — disallowed kinds and failed uploads. */
  failed: Array<{ name: string }>;
}

/**
 * Uploads composer attachments to Convex storage.
 *
 * Failures are reported rather than dropped: sending anyway produced a turn
 * where the user had attached a screenshot, Eva never received it, and only a
 * toast that had already faded said so.
 */
export function useUploadChatAttachments() {
  const uploadBlobs = useUploadBlobs();
  return async (
    files: PromptInputMessage["files"],
  ): Promise<ChatAttachmentUploads> => {
    const allowed: PromptInputMessage["files"] = [];
    const failed: Array<{ name: string }> = [];
    for (const file of files) {
      if (isAllowedAttachmentFile(file)) {
        allowed.push(file);
        continue;
      }
      failed.push({ name: labelForAttachment(file.filename, file.mediaType) });
    }
    const items = await Promise.all(
      allowed.map(async (file) => {
        const blob = await (await fetch(file.url)).blob();
        return { blob, contentType: contentTypeForUpload(file, blob.type) };
      }),
    );
    const uploaded = await uploadBlobs(items);
    const ids: Id<"_storage">[] = [];
    for (const [index, id] of uploaded.entries()) {
      if (id !== null) {
        ids.push(id);
        continue;
      }
      const file = allowed[index];
      failed.push({
        name: labelForAttachment(file?.filename, file?.mediaType),
      });
    }
    return { ids, failed };
  };
}

/** Failed attachments as one line of toast copy: up to three names, then a count. */
export function describeFailedAttachments(
  failed: ReadonlyArray<{ name: string }>,
): string {
  const names = failed.map((file) => file.name);
  const shown = names.slice(0, 3).join(", ");
  const rest = names.length - 3;
  return rest > 0 ? `${shown} +${rest} more` : shown;
}

/**
 * Chips grow in and shrink back out along the same path. Attaching or removing
 * a file used to be a hard cut in the busiest control in the app. Critically
 * damped — picking a file carries no momentum, so there is nothing to overshoot.
 */
const CHIP_MOTION = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
  transition: { type: "spring", bounce: 0, duration: 0.22 },
} as const;

type OpenTextAttachment = {
  title: string;
  text: string;
  fileId: string;
  filename: string;
  mediaType: string;
};

/**
 * Composer attachment strip: image thumbnails + file chips for text/HTML.
 * Must be inside <PromptInput>. Clicking a non-image chip opens an editable
 * text modal; Save replaces the attachment in place.
 */
export function ChatAttachmentPreview() {
  const attachments = usePromptInputAttachments();
  const [open, setOpen] = useState<OpenTextAttachment | null>(null);

  if (attachments.files.length === 0 && open === null) return null;

  return (
    <>
      {attachments.files.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <AnimatePresence initial={false}>
            {attachments.files.map((file) => {
              const isImage = file.mediaType?.startsWith("image/");
              const FileIcon = iconForAttachment(file.filename, file.mediaType);
              const label = labelForAttachment(file.filename, file.mediaType);

              if (isImage) {
                return (
                  <m.div
                    key={file.id}
                    {...CHIP_MOTION}
                    className="group relative size-16 overflow-hidden rounded-surface border border-border bg-muted"
                  >
                    <img
                      src={file.url}
                      alt={file.filename ?? "Attached image"}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      onClick={() => attachments.remove(file.id)}
                      className="reveal-on-hover max-sm:hit-target motion-press absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-foreground hover:bg-background active:scale-[0.88]"
                    >
                      <IconX className="size-3" />
                    </button>
                  </m.div>
                );
              }

              return (
                <m.div
                  key={file.id}
                  {...CHIP_MOTION}
                  className="group relative flex max-w-48 items-center gap-2 rounded-surface border border-border bg-muted px-2 py-1.5"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => {
                      // Computed outside the try/catch — the React Compiler
                      // bails on value blocks (??, ||) inside try/catch and
                      // drops memoization for the whole file.
                      const filename = file.filename ?? "pasted-text.txt";
                      const mediaType = file.mediaType || "text/plain";
                      void (async () => {
                        try {
                          const response = await fetch(file.url);
                          if (!response.ok) {
                            toast.error("Could not load attachment.");
                            return;
                          }
                          const text = await response.text();
                          setOpen({
                            title: label,
                            text,
                            fileId: file.id,
                            filename,
                            mediaType,
                          });
                        } catch {
                          toast.error("Could not load attachment.");
                        }
                      })();
                    }}
                  >
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-xs text-foreground">
                      {label}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    onClick={() => attachments.remove(file.id)}
                    className="reveal-on-hover max-sm:hit-target motion-press absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-foreground hover:bg-background active:scale-[0.88]"
                  >
                    <IconX className="size-3" />
                  </button>
                </m.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : null}

      {open ? (
        <TextAttachmentModal
          title={open.title}
          text={open.text}
          readOnly={false}
          onClose={() => setOpen(null)}
          onSave={(nextText) => {
            attachments.replace(
              open.fileId,
              new File([nextText], open.filename, { type: open.mediaType }),
            );
            setOpen(null);
          }}
        />
      ) : null}
    </>
  );
}
