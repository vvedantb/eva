import { IconX } from "@tabler/icons-react";
import {
  iconForAttachment,
  isImageContentType,
  labelForAttachment,
} from "./attachmentMeta";

interface AttachmentCardProps {
  name?: string;
  contentType: string | null;
  url: string | null;
  onRemove?: () => void;
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
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          className="reveal-on-hover max-sm:hit-target absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-foreground hover:bg-background max-sm:p-1.5"
        >
          <IconX className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
