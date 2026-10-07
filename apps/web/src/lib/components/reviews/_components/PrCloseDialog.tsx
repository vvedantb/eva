"use client";

import {
  Button,
  CrossfadeIcon,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@eva/ui";
import { IconGitPullRequestClosed } from "@tabler/icons-react";

/**
 * Closing a pull request notifies every reviewer and stops CI, so it asks
 * first — the same bar merge is held to one control over. Alt-click skips it
 * (see `requestConfirm` in the header).
 */
export function PrCloseDialog({
  prNumber,
  open,
  onOpenChange,
  onConfirm,
  closing,
}: {
  prNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  closing: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Close pull request #{prNumber} without merging?
          </DialogTitle>
          <DialogDescription>
            Reviewers are notified and CI stops. You can reopen it later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={closing}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={closing}>
            <CrossfadeIcon
              show={closing}
              trueKey="loading"
              falseKey="idle"
              variant="soft"
              className="relative flex size-3.5 items-center justify-center"
              whenTrue={<Spinner size="sm" />}
              whenFalse={<IconGitPullRequestClosed size={14} />}
            />
            {closing ? "Closing" : "Close pull request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
