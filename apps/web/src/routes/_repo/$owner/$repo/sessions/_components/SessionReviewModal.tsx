"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  motionBase,
  motionSlow,
  Spinner,
} from "@eva/ui";
import { IconCircleCheck } from "@tabler/icons-react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { m, AnimatePresence } from "motion/react";
import { useState } from "react";
import { catchMutationError } from "@/lib/utils/mutationToast";

/** Opens (or un-drafts) this session's PR. Shared by the confirm dialog and Alt-click bypass. */
export function useSendSessionForReview(sessionId: Id<"sessions">) {
  const createPr = useAction(api.github.createSessionPr);
  const [isCreatingPr, setIsCreatingPr] = useState(false);

  const sendForReview = async (): Promise<boolean> => {
    setIsCreatingPr(true);
    try {
      await catchMutationError(
        createPr({ sessionId }),
        "Couldn't create pull request",
        "session-create-pr",
      );
    } catch {
      setIsCreatingPr(false);
      return false;
    }
    setIsCreatingPr(false);
    return true;
  };

  return { sendForReview, isCreatingPr };
}

interface SessionReviewModalProps {
  sessionId: Id<"sessions">;
  open: boolean;
  onClose: () => void;
}

export function SessionReviewModal({
  sessionId,
  open,
  onClose,
}: SessionReviewModalProps) {
  const [reviewStep, setReviewStep] = useState<"confirm" | "complete">(
    "confirm",
  );
  const { sendForReview, isCreatingPr } = useSendSessionForReview(sessionId);

  const handleClose = () => {
    onClose();
    setReviewStep("confirm");
  };

  const handleCreatePr = async () => {
    const ok = await sendForReview();
    if (ok) setReviewStep("complete");
    else setReviewStep("confirm");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) handleClose();
      }}
    >
      <DialogContent>
        <AnimatePresence initial={false} mode="wait">
          {reviewStep === "confirm" && (
            <m.div
              key="confirm"
              className="space-y-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -20 }}
              transition={motionBase}
            >
              <DialogHeader>
                <DialogTitle>Send for Code Review</DialogTitle>
              </DialogHeader>
              <p className="text-muted-foreground">
                Marks your PR ready for review. The session stays open.
              </p>
              <DialogFooter>
                <Button variant="ghost" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  className="bg-status-code-review text-white hover:bg-status-code-review/90"
                  onClick={handleCreatePr}
                  disabled={isCreatingPr}
                >
                  {isCreatingPr ? <Spinner size="sm" /> : "Confirm"}
                </Button>
              </DialogFooter>
            </m.div>
          )}
          {reviewStep === "complete" && (
            <m.div
              key="complete"
              className="space-y-4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={motionSlow}
            >
              <DialogHeader>
                <DialogTitle>Review Sent</DialogTitle>
              </DialogHeader>
              <m.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...motionSlow, delay: 0.1 }}
                className="rounded-surface bg-status-code-review-bg p-4 text-center"
              >
                <IconCircleCheck
                  size={24}
                  className="mx-auto mb-2 text-status-code-review"
                />
                <p className="text-sm font-medium text-status-code-review">
                  Sent to the team for review.
                </p>
              </m.div>
              <DialogFooter>
                <Button onClick={handleClose}>Done</Button>
              </DialogFooter>
            </m.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
