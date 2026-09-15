"use client";

import { useState } from "react";
import { api, publishErrorNeedsForcePush, type Id } from "@eva/backend";
import { useMutation } from "convex/react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { IconAlertTriangle, IconUpload } from "@tabler/icons-react";
import { catchMutationError } from "@/lib/utils/mutationToast";
import {
  ConfirmSkipHint,
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";
import type { SessionMessage } from "./useSessionSend";

interface PublishRecoveryBannerProps {
  sessionId: Id<"sessions">;
  messages: SessionMessage[];
  isSandboxActive: boolean;
}

/**
 * One-click recovery for the rewritten-branch publish refusal. Shown only
 * while the newest chat message is that refusal alert: the confirmed
 * force-push posts its own outcome alert, which becomes the newest message
 * and dismisses the banner without any extra state.
 */
export function PublishRecoveryBanner({
  sessionId,
  messages,
  isSandboxActive,
}: PublishRecoveryBannerProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [requestedForId, setRequestedForId] = useState<Id<"messages"> | null>(
    null,
  );
  const forcePushBranch = useMutation(api.sessions.forcePushBranch);
  const altHeld = useAltHeld();

  const newest = messages.length > 0 ? messages[messages.length - 1] : null;
  const visible =
    newest !== null &&
    newest.isSystemAlert === true &&
    typeof newest.errorDetail === "string" &&
    publishErrorNeedsForcePush(newest.errorDetail);
  const requested = visible && newest !== null && requestedForId === newest._id;
  const newestId = newest?._id;

  const handleConfirm = () => {
    setConfirmOpen(false);
    void catchMutationError(
      forcePushBranch({ sessionId }),
      "Couldn't start the force-push",
      "session-force-push",
    )
      .then(() => {
        if (newestId) setRequestedForId(newestId);
      })
      .catch(() => undefined);
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {visible && newestId ? (
      <m.div
        key={newestId}
        className="mb-2 flex flex-wrap items-center gap-2 rounded-surface border border-border bg-muted/30 px-3 py-2.5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={motionFast}
      >
        <Badge
          variant="destructive"
          className="shrink-0 rounded-md px-1.5 py-0 text-[10px] font-semibold tracking-wide uppercase"
        >
          Publish blocked
        </Badge>
        <span className="min-w-0 flex-1 text-sm text-muted-foreground">
          {requested
            ? "Force-push requested — the result will appear in the chat."
            : isSandboxActive
              ? "The branch history was rewritten. Updating GitHub needs a force-push."
              : "The branch history was rewritten. Wake the sandbox, then force-push to update GitHub."}
        </span>
        {!requested ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            disabled={!isSandboxActive}
            title={skipConfirmTitle("Force-push branch")}
            onClick={(event) =>
              requestConfirm(
                altHeld,
                () => setConfirmOpen(true),
                handleConfirm,
                event,
              )
            }
          >
            <IconUpload className="size-3.5" />
            Force-push branch
            <ConfirmSkipHint />
          </Button>
        ) : null}
      </m.div>
        ) : null}
      </AnimatePresence>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconAlertTriangle size={16} className="text-destructive" />
              Force-push branch to GitHub?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This replaces the branch on GitHub (and the PR&apos;s commits) with
            the sandbox&apos;s local history. Commits that exist only on GitHub
            for this branch will be discarded. If the branch was rebased onto a
            different base, retarget the PR afterwards.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirm}>
              Force-push
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
