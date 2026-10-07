"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { IconPaperclip } from "@tabler/icons-react";
import { toast } from "@eva/ui";
import { api, type Id } from "@eva/backend";
import { AttachmentCard } from "@/lib/components/attachments/AttachmentCard";
import {
  CHAT_ATTACHMENT_ACCEPT,
  isImageContentType,
  labelForAttachment,
} from "@/lib/components/attachments/attachmentMeta";
import { TextAttachmentModal } from "@/lib/components/attachments/TextAttachmentModal";
import type { TaskAttachment } from "../useTaskAttachments";
import { ConfirmDialog } from "./ConfirmDialog";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { requestConfirm, useAltHeld } from "@/lib/confirm";

interface TaskFilesSectionProps {
  attachments: TaskAttachment[];
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  onReplace: (key: string, file: File) => void;
  /** The draft this composer is editing, when its files are already in storage. */
  draftTaskId: Id<"agentTasks"> | null;
}

type OpenTextAttachment = {
  key: string;
  title: string;
  text: string;
  readOnly: boolean;
  filename: string;
  mediaType: string;
};

/**
 * Quick task composer file picker: a paperclip button plus a "Files" list of
 * the attached cards. Pasting an image into the description and dropping files
 * onto the modal both feed the same `onAdd`.
 *
 * Removing a file the user just picked is instant — nothing has been stored yet.
 * A file already saved on a draft is confirmed first, because removing it
 * deletes the stored blob for good.
 */
export function TaskFilesSection({
  attachments,
  onAdd,
  onRemove,
  onReplace,
  draftTaskId,
}: TaskFilesSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const removeAttachment = useMutation(api.agentTasks.removeAttachment);
  // The stored file awaiting confirmation, held until confirm or cancel.
  const [pending, setPending] = useState<{
    key: string;
    storageId: Id<"_storage">;
    label: string;
  } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const altHeld = useAltHeld();
  const [open, setOpen] = useState<OpenTextAttachment | null>(null);

  const requestRemove = (attachment: TaskAttachment) => {
    // Not stored yet, or stored but not yet attached to a draft (a failed
    // submit): dropping it locally is all we can do.
    if (!attachment.storageId || !draftTaskId) {
      onRemove(attachment.key);
      return;
    }
    const next = {
      key: attachment.key,
      storageId: attachment.storageId,
      label: labelForAttachment(attachment.name, attachment.contentType),
    };
    requestConfirm(altHeld, () => setPending(next), () => {
      void removeStored(next);
    });
  };

  const removeStored = async (file: {
    key: string;
    storageId: Id<"_storage">;
    label: string;
  }) => {
    if (!draftTaskId) return;
    setIsRemoving(true);
    // Reset is duplicated into the catch instead of using `finally`: React
    // Compiler bails on the whole file when it meets a `finally` clause.
    try {
      await withMutationToast(
        removeAttachment({
          taskId: draftTaskId,
          storageId: file.storageId,
        }),
        "File removed",
        "Couldn't remove file",
        "draft-file-remove",
      );
      onRemove(file.key);
      setPending(null);
    } catch {
      setIsRemoving(false);
      return;
    }
    setIsRemoving(false);
  };

  const handleConfirm = async () => {
    if (!pending) return;
    await removeStored(pending);
  };

  const openTextAttachment = (attachment: TaskAttachment) => {
    void (async () => {
      const title = labelForAttachment(attachment.name, attachment.contentType);
      const filename = attachment.name ?? "pasted-text.txt";
      const mediaType = attachment.contentType || "text/plain";
      // Hydrated drafts have storageId + no local File — open read-only so
      // editing would not orphan the stored blob.
      const readOnly = attachment.file === null && attachment.storageId !== null;

      try {
        if (attachment.file) {
          const text = await attachment.file.text();
          setOpen({
            key: attachment.key,
            title,
            text,
            readOnly: false,
            filename,
            mediaType,
          });
          return;
        }
        if (!attachment.url) {
          toast.error("Could not load attachment.");
          return;
        }
        const response = await fetch(attachment.url);
        if (!response.ok) {
          toast.error("Could not load attachment.");
          return;
        }
        const text = await response.text();
        setOpen({
          key: attachment.key,
          title,
          text,
          readOnly,
          filename,
          mediaType,
        });
      } catch {
        toast.error("Could not load attachment.");
      }
    })();
  };

  return (
    <div className="flex flex-col gap-2 px-5 pb-2">
      {attachments.length > 0 ? (
        <>
          <span className="text-xs font-medium text-muted-foreground">
            Files
          </span>
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <AttachmentCard
                key={attachment.key}
                name={attachment.name}
                contentType={attachment.contentType}
                url={attachment.url}
                onRemove={() => requestRemove(attachment)}
                onOpen={
                  isImageContentType(attachment.contentType)
                    ? undefined
                    : () => openTextAttachment(attachment)
                }
              />
            ))}
          </div>
        </>
      ) : null}

      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
        >
          <IconPaperclip size={14} />
          <span>Attach files</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={CHAT_ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            onAdd(Array.from(e.target.files ?? []));
            // Reset so picking the same file again still fires onChange.
            e.target.value = "";
          }}
        />
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !isRemoving) setPending(null);
        }}
        title="Remove file"
        description={
          <>
            Are you sure you want to remove <strong>{pending?.label}</strong>{" "}
            from this draft?
          </>
        }
        detail="The file is deleted from storage. This action cannot be undone."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleConfirm}
        isLoading={isRemoving}
      />

      {open ? (
        <TextAttachmentModal
          title={open.title}
          text={open.text}
          readOnly={open.readOnly}
          onClose={() => setOpen(null)}
          onSave={
            open.readOnly
              ? undefined
              : (nextText) => {
                  onReplace(
                    open.key,
                    new File([nextText], open.filename, {
                      type: open.mediaType,
                    }),
                  );
                  setOpen(null);
                }
          }
        />
      ) : null}
    </div>
  );
}
