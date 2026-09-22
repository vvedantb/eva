"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { AttachmentCard } from "@/lib/components/attachments/AttachmentCard";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { labelForAttachment } from "@/lib/components/attachments/attachmentMeta";
import { ConfirmDialog } from "@/lib/components/quick-tasks/_components/ConfirmDialog";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { requestConfirm, useAltHeld } from "@/lib/confirm";

/**
 * "Files" section for a task's attachments. Each card opens the stored blob in a
 * new tab; hovering reveals a remove button. Removing deletes the stored blob,
 * so it is confirmed first and cannot be undone. Files can only be added when
 * the task is created.
 */
export function TaskAttachments({ taskId }: { taskId: Id<"agentTasks"> }) {
  const attachments = useQuery(api.agentTasks.listAttachments, { taskId });
  const removeAttachment = useMutation(api.agentTasks.removeAttachment);
  // The file awaiting confirmation, held until the user confirms or cancels.
  const [pending, setPending] = useState<{
    storageId: Id<"_storage">;
    label: string;
  } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const altHeld = useAltHeld();

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
            transition={motionFast}
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
                        onRemove={() => {
                          const next = {
                            storageId: attachment.storageId,
                            label: labelForAttachment(
                              undefined,
                              attachment.contentType,
                            ),
                          };
                          requestConfirm(altHeld, () => setPending(next), () => {
                            void removeStored(next);
                          });
                        }}
                      />
                    </a>
                  </ListEnter>
                ) : null,
              )}
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
      <ConfirmDialog
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
        detail="The file is deleted from storage. This action cannot be undone."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleConfirm}
        isLoading={isRemoving}
      />
    </>
  );
}
