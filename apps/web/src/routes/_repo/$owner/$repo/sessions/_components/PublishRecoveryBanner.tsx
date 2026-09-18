"use client";

import { useState } from "react";
import { api, publishErrorNeedsForcePush, type Id } from "@eva/backend";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
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
<<<<<<< HEAD
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";
=======
import {
  ConfirmSkipHint,
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";
>>>>>>> origin/main
import type { SessionMessage } from "./useSessionSend";

interface PublishRecoveryBannerProps {
  sessionId: Id<"sessions">;
  messages: SessionMessage[];
  isSandboxActive: boolean;
}

/** Which checkout a confirmed force-push rewrites. */
interface ForcePushTarget {
  /** Absent for the primary repo, which is what the session branch means. */
  sessionRepoId?: Id<"sessionRepos">;
  /** Repo label for the confirm dialog; absent for the primary. */
  label?: string;
}

/**
 * Identity of one force-push offer. Scoped to the refusal message so a new
 * refusal re-offers every repo instead of showing a stale "requested" state.
 */
function forcePushOfferKey(
  messageId: Id<"messages">,
  target: ForcePushTarget,
): string {
  return `${messageId}:${target.sessionRepoId ?? "primary"}`;
}

/**
 * Compact per-repo recovery action for a multi-repo session's linked clones.
 * Divergence is only detected for the session branch as a whole, so a linked
 * repo is offered on the same refusal, gated on it having a published PR.
 */
function LinkedRepoRecoveryRow({
  label,
  requested,
  isSandboxActive,
  onRequest,
}: {
  label: string;
  requested: boolean;
  isSandboxActive: boolean;
  onRequest: () => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-surface bg-muted/30 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {requested
          ? `Force-push requested for ${label}.`
          : `${label} has its own published branch.`}
      </span>
      {!requested ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 gap-1 px-2 text-xs"
          disabled={!isSandboxActive}
          onClick={onRequest}
        >
          <IconUpload className="size-3.5" />
          Force-push {label}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One-click recovery for the rewritten-branch publish refusal. Shown only
 * while the newest chat message is that refusal alert: the confirmed
 * force-push posts its own outcome alert, which becomes the newest message
 * and dismisses the banner without any extra state.
 *
 * Multi-repo sessions add one compact row per linked repo that has been
 * published, since each clone has its own branch on GitHub to recover.
 */
export function PublishRecoveryBanner({
  sessionId,
  messages,
  isSandboxActive,
}: PublishRecoveryBannerProps) {
  const [confirmTarget, setConfirmTarget] = useState<ForcePushTarget | null>(
    null,
  );
  const [requestedOffers, setRequestedOffers] = useState<readonly string[]>([]);
  const forcePushBranch = useMutation(api.sessions.forcePushBranch);
<<<<<<< HEAD
  const repos = useQuery(api.sessions.listRepos, { sessionId });

  const newest = messages.length > 0 ? messages[messages.length - 1] : null;
  if (
    newest === null ||
    newest.isSystemAlert !== true ||
    typeof newest.errorDetail !== "string" ||
    !publishErrorNeedsForcePush(newest.errorDetail)
  ) {
    return null;
  }
  const newestId = newest._id;
  const isRequested = (target: ForcePushTarget) =>
    requestedOffers.includes(forcePushOfferKey(newestId, target));
  const requested = isRequested({});
  // Only linked clones that were published have a remote branch to rewrite.
  const linkedTargets =
    repos === undefined || repos.length <= 1
      ? []
      : repos.flatMap((repo) =>
          repo.kind === "linked" &&
          repo.sessionRepoId !== undefined &&
          repo.prUrl !== undefined
            ? [
                {
                  sessionRepoId: repo.sessionRepoId,
                  label: repoDisplayLabel(repo),
                },
              ]
            : [],
        );
=======
  const altHeld = useAltHeld();

  const newest = messages.length > 0 ? messages[messages.length - 1] : null;
  const visible =
    newest !== null &&
    newest.isSystemAlert === true &&
    typeof newest.errorDetail === "string" &&
    publishErrorNeedsForcePush(newest.errorDetail);
  const requested = visible && newest !== null && requestedForId === newest._id;
  const newestId = newest?._id;
>>>>>>> origin/main

  const handleConfirm = (target: ForcePushTarget) => {
    setConfirmTarget(null);
    const key = forcePushOfferKey(newestId, target);
    void catchMutationError(
      forcePushBranch({
        sessionId,
        ...(target.sessionRepoId !== undefined
          ? { sessionRepoId: target.sessionRepoId }
          : {}),
      }),
      "Couldn't start the force-push",
      "session-force-push",
    )
<<<<<<< HEAD
      .then(() => setRequestedOffers((keys) => [...keys, key]))
=======
      .then(() => {
        if (newestId) setRequestedForId(newestId);
      })
>>>>>>> origin/main
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
<<<<<<< HEAD
            onClick={() => setConfirmTarget({})}
=======
            title={skipConfirmTitle("Force-push branch")}
            onClick={(event) =>
              requestConfirm(
                altHeld,
                () => setConfirmOpen(true),
                handleConfirm,
                event,
              )
            }
>>>>>>> origin/main
          >
            <IconUpload className="size-3.5" />
            Force-push branch
            <ConfirmSkipHint />
          </Button>
        ) : null}
<<<<<<< HEAD
      </div>
      {linkedTargets.map((target) => (
        <LinkedRepoRecoveryRow
          key={target.sessionRepoId}
          label={target.label}
          requested={isRequested(target)}
          isSandboxActive={isSandboxActive}
          onRequest={() => setConfirmTarget(target)}
        />
      ))}
      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
=======
      </m.div>
        ) : null}
      </AnimatePresence>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
>>>>>>> origin/main
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconAlertTriangle size={16} className="text-destructive" />
              {confirmTarget?.label
                ? `Force-push ${confirmTarget.label} branch to GitHub?`
                : "Force-push branch to GitHub?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This replaces the branch on GitHub (and the PR&apos;s commits) with
            the sandbox&apos;s local history. Commits that exist only on GitHub
            for this branch will be discarded. If the branch was rebased onto a
            different base, retarget the PR afterwards.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmTarget !== null) handleConfirm(confirmTarget);
              }}
            >
              Force-push
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
