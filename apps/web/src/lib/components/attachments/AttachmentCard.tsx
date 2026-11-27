import { IconX } from "@tabler/icons-react";
import {
  iconForAttachment,
  isImageContentType,
  labelForAttachment,
} from "./attachmentMeta";

interface AttachmentCardProps {
  /** Original filename when known — absent for stored attachments. */
  name?: string;
  contentType: string | null;
  /** Object URL while composing, signed storage URL once uploaded. */
  url: string | null;
  /** Omit to render a read-only card. */
  onRemove?: () => void;
  /** When set, the card body opens the attachment (e.g. text modal). */
  onOpen?: () => void;
}

/**
 * One attached file: an image thumbnail or a type icon, plus its name. Shared
 * by the quick task composer and the task detail view so both read alike.
 */
export function AttachmentCard({
  name,
  contentType,
  url,
  onRemove,
  onOpen,
}: AttachmentCardProps) {
  const label = labelForAttachment(name, contentType);
  const FileIcon = iconForAttachment(name, contentType);
  const showThumbnail = isImageContentType(contentType) && url !== null;

  const body = (
    <>
      {showThumbnail ? (
        <img
          src={url}
          alt={label}
          className="size-8 shrink-0 rounded-sm border border-border object-cover"
        />
      ) : (
        <FileIcon className="size-8 shrink-0 p-1.5 text-muted-foreground" />
      )}
      <span className="truncate text-xs text-foreground">{label}</span>
    </>
  );

  return (
    <div className="group relative flex w-52 max-w-full items-center gap-2 rounded-surface border border-border bg-muted px-2 py-1.5">
      {onOpen ? (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onOpen}
        >
          {body}
        </button>
      ) : (
        body
      )}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          // The card may sit inside a link (task detail opens the blob in a new
          // tab); removing must not also navigate.
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          // `reveal-on-hover` (globals.css) keeps the quiet hover reveal on a
          // pointer device and ships the control visible below `sm`, where there
          // is no hover and this is the only way to drop an attachment.
          className="reveal-on-hover max-sm:hit-target absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-foreground hover:bg-background max-sm:p-1.5"
        >
          <IconX className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
