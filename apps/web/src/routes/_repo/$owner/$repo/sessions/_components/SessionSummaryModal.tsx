"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@eva/ui";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useMutation } from "convex/react";
import { useState } from "react";
import { catchMutationError } from "@/lib/utils/mutationToast";

/** Starts a session summary. Shared by the confirm dialog and Alt-click bypass. */
export function useStartSessionSummary(sessionId: Id<"sessions">) {
  const startSummarize = useMutation(api.summarizeWorkflow.startSummarize);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const startSummary = async (): Promise<boolean> => {
    setIsSummarizing(true);
    try {
      await catchMutationError(
        startSummarize({ sessionId }),
        "Couldn't generate summary",
        "session-summarize",
      );
    } catch {
      setIsSummarizing(false);
      return false;
    }
    setIsSummarizing(false);
    return true;
  };

  return { startSummary, isSummarizing };
}

interface SessionSummaryModalProps {
  sessionId: Id<"sessions">;
  hasSummary: boolean;
  open: boolean;
  onClose: () => void;
}

export function SessionSummaryModal({
  sessionId,
  hasSummary,
  open,
  onClose,
}: SessionSummaryModalProps) {
  const { startSummary, isSummarizing } = useStartSessionSummary(sessionId);

  const handleConfirm = async () => {
    const ok = await startSummary();
    if (ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {hasSummary ? "Regenerate Summary" : "Generate Summary"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            {hasSummary
              ? "This will regenerate and replace the current session summary."
              : "This will generate a session summary from the current chat history."}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isSummarizing}>
            {isSummarizing ? <Spinner size="sm" /> : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
