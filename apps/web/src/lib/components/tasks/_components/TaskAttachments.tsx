"use client";

import { useRef, useState } from "react";
import { IconPaperclip } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import {
  tokenTransition,
  useRequestConfirm,
  ListEnter,
  ConfirmDialog,
} from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import { AttachmentCard } from "@/lib/components/attachments/AttachmentCard";
import {
  CHAT_ATTACHMENT_ACCEPT,
  labelForAttachment,
} from "@/lib/components/attachments/attachmentMeta";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { useAddTaskFiles } from "./useAddTaskFiles";

/**
 * "Files" section for a task's attachments. Each card opens the stored blob in a
 * new tab; hovering reveals a remove button. Removing deletes the stored blob,
 * so it is confirmed first and cannot be undone. "Attach files" uploads more
 * (pasting into the description does too). A read-only (archived) task shows
 * neither control.
 */
export function TaskAttachments({
  taskId,
  readOnly,
}: {
  taskId: Id<"agentTasks">;
  readOnly: boolean;
}) {
  const attachments = useQuery(api.agentTasks.listAttachments, { taskId });
  const removeAttachment = useMutation(api.agentTasks.removeAttachment);
  // The file awaiting confirmation, held until the user confirms or cancels.
  const [pending, setPending] = useState<{
    storageId: Id<"_storage">;
    label: string;
  } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const { request: requestConfirm } = useRequestConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const addFiles = useAddTaskFiles(taskId);

  async function removeStored(file: {
    storageId: Id<"_storage">;
    label: string;
  }) {
    setIsRemoving(true);
    // Reset is duplicated into the catch instead of using `finally`: React
    // Compiler bails on the whole file when it meets a `finally` clause.
    try {
      await withMutationToast(
        removeAttachment({ taskId, storageId: file.storageId }),
        "File removed",
        "Couldn't remove file",
        "task-file-remove",
      );
      setPending(null);
    } catch {
      setIsRemoving(false);
      return;
    }
    setIsRemoving(false);
  }

  function confirmRemove(file: { storageId: Id<"_storage">; label: string }) {
    requestConfirm(
      () => setPending(file),
      () => {
        void removeStored(file);
      },
    );
  }

  async function handleConfirm() {
    if (!pending) return;
    await removeStored(pending);
  }

  if (attachments === undefined) return null;

  return (
    <>
      <AnimatePresence initial={false}>
        {attachments.length > 0 ? (
          <m.div
            key="task-attachments"
            className="flex flex-col gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={tokenTransition.fast}
          >
            <span className="text-xs font-medium text-muted-foreground">
              Files
            </span>
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment, index) =>
                attachment.url ? (
                  <ListEnter key={attachment.storageId} index={index} fast>
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-surface transition-opacity hover:opacity-80"
                    >
                      <AttachmentCard
                        contentType={attachment.contentType}
                        url={attachment.url}
                        onRemove={
                          readOnly
                            ? undefined
                            : () =>
                                confirmRemove({
                                  storageId: attachment.storageId,
                                  label: labelForAttachment(
                                    undefined,
                                    attachment.contentType,
                                  ),
                                })
                        }
                      />
                    </a>
                  </ListEnter>
                ) : null,
              )}
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
      {readOnly ? null : (
        <div>
          <button
            type="button"
            disabled={addFiles.isUploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 -mx-2 text-xs text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
          >
            <IconPaperclip size={14} />
            <span>{addFiles.isUploading ? "Uploading…" : "Attach files"}</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={CHAT_ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={(e) => {
              void addFiles.add(Array.from(e.target.files ?? []));
              // Reset so picking the same file again still fires onChange.
              e.target.value = "";
            }}
          />
        </div>
      )}
      <ConfirmDialog
        size="md"
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !isRemoving) setPending(null);
        }}
        title="Remove file"
        description={
          <>
            Are you sure you want to remove <strong>{pending?.label}</strong>{" "}
            from this task?
          </>
        }
        body={
          <p className="text-sm text-muted-foreground">
            The file is deleted from storage. This action cannot be undone.
          </p>
        }
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleConfirm}
        pending={isRemoving}
      />
    </>
  );
}
