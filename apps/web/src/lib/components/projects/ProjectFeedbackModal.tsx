"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  Textarea,
} from "@vvedantb/ui";
import { TaskFilesSection } from "@/lib/components/quick-tasks/_components/TaskFilesSection";
import { useTaskAttachments } from "@/lib/components/quick-tasks/useTaskAttachments";
import { withMutationToast } from "@/lib/utils/mutationToast";

/**
 * A viewer's one write action in a project (`agentTasks.createFeedbackTask`):
 * text plus files, the same file picker as the quick task composer. The task
 * lands in the project's To Do, not approved, so nothing runs until a
 * contributor approves it.
 */
export function ProjectFeedbackModal({
  projectId,
  isOpen,
  onClose,
}: {
  projectId: Id<"projects">;
  isOpen: boolean;
  onClose: () => void;
}) {
  const createFeedbackTask = useMutation(api.agentTasks.createFeedbackTask);
  const attachments = useTaskAttachments();
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);

  const close = () => {
    setText("");
    attachments.reset();
    onClose();
  };

  const send = async () => {
    setIsSending(true);
    const attachmentStorageIds = await attachments.upload();
    await withMutationToast(
      createFeedbackTask({
        projectId,
        text,
        attachmentStorageIds:
          attachmentStorageIds.length > 0 ? attachmentStorageIds : undefined,
      }),
      "Feedback sent",
      "Couldn't send feedback",
      "project-feedback",
    ).then(close, () => undefined);
    setIsSending(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>Feedback</DialogTitle>
        </DialogHeader>
        <div className="px-5 py-3">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            autoFocus
            className="min-h-[160px] resize-y"
          />
        </div>
        <TaskFilesSection
          attachments={attachments.attachments}
          onAdd={attachments.add}
          onRemove={attachments.remove}
          onReplace={attachments.replace}
          draftTaskId={null}
        />
        <DialogFooter className="gap-2 px-5 py-3">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={() => void send()}
            disabled={!text.trim() || isSending}
          >
            {isSending ? <Spinner size="sm" /> : null}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
