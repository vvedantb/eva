"use client";

import { useState, type MouseEventHandler } from "react";
import { api, type Id } from "@eva/backend";
import {
  forcePushConfirmTitle,
  forcePushOfferKey,
  linkedForcePushTargets,
  linkedRepoForcePushLabel,
  linkedRepoRecoveryText,
  needsPublishRecovery,
  publishRecoveryMessage,
  PUBLISH_RECOVERY_COPY,
  type ForcePushTarget,
} from "@eva/shared/publishRecovery";
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
  tokenTransition,
  ConfirmSkipHint,
  skipConfirmTitle,
  useRequestConfirm,
} from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import { IconAlertTriangle, IconUpload } from "@tabler/icons-react";
import { catchMutationError } from "@/lib/utils/mutationToast";
import type { TranscriptMessage } from "@/lib/hooks/useChatTranscript";

interface PublishRecoveryBannerProps {
  sessionId: Id<"sessions">;
  messages: TranscriptMessage[];
  isSandboxActive: boolean;
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
  onRequest: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-surface bg-muted/30 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {linkedRepoRecoveryText(label, requested)}
      </span>
      {!requested ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 gap-1 px-2 text-xs"
          disabled={!isSandboxActive}
          title={skipConfirmTitle(linkedRepoForcePushLabel(label))}
          onClick={onRequest}
        >
          <IconUpload className="size-3.5" />
          {linkedRepoForcePushLabel(label)}
          <ConfirmSkipHint />
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
  const repos = useQuery(api.sessions.listRepos, { sessionId });
  const { request: requestConfirm } = useRequestConfirm();

  const newest = messages.length > 0 ? messages[messages.length - 1] : null;
  // Not an early return: the banner animates out, so it has to stay mounted
  // inside AnimatePresence for one more frame after the refusal is superseded.
  const visible = needsPublishRecovery(newest);
  const newestId = newest?._id;
  const isRequested = (target: ForcePushTarget) =>
    newestId !== undefined &&
    requestedOffers.includes(forcePushOfferKey(newestId, target));
  const requested = visible && isRequested({});
  const linkedTargets = linkedForcePushTargets(repos);

  const handleConfirm = (target: ForcePushTarget) => {
    setConfirmTarget(null);
    if (newestId === undefined) return;
    const key = forcePushOfferKey(newestId, target);
    // Marked requested before the mutation settles: the button unmounts at
    // once, so an alt-click double-click cannot send a second force-push.
    // A failure takes the mark back so the user can retry.
    if (requestedOffers.includes(key)) return;
    setRequestedOffers((keys) => [...keys, key]);
    void catchMutationError(
      forcePushBranch({
        sessionId,
        ...(target.sessionRepoId !== undefined
          ? { sessionRepoId: target.sessionRepoId }
          : {}),
      }),
      PUBLISH_RECOVERY_COPY.failed,
      "session-force-push",
    ).catch(() =>
      setRequestedOffers((keys) => keys.filter((entry) => entry !== key)),
    );
  };

  /** Alt-click skips the dialog, as everywhere else confirmation is offered. */
  const requestForcePush = (
    target: ForcePushTarget,
    event: { altKey?: boolean },
  ) =>
    requestConfirm(
      () => setConfirmTarget(target),
      () => handleConfirm(target),
      event,
    );

  return (
    <>
      <AnimatePresence initial={false}>
        {visible && newestId ? (
          <m.div
            key={newestId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={tokenTransition.fast}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-surface border border-border bg-muted/30 px-3 py-2.5">
              <Badge
                variant="destructive"
                className="shrink-0 rounded-md px-1.5 py-0 text-3xs font-semibold tracking-wide uppercase"
              >
                {PUBLISH_RECOVERY_COPY.badge}
              </Badge>
              <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                {publishRecoveryMessage(requested, isSandboxActive)}
              </span>
              {!requested ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  disabled={!isSandboxActive}
                  title={skipConfirmTitle(PUBLISH_RECOVERY_COPY.button)}
                  onClick={(event) => requestForcePush({}, event)}
                >
                  <IconUpload className="size-3.5" />
                  {PUBLISH_RECOVERY_COPY.button}
                  <ConfirmSkipHint />
                </Button>
              ) : null}
            </div>
            {linkedTargets.map((target) => (
              <LinkedRepoRecoveryRow
                key={target.sessionRepoId}
                label={target.label}
                requested={isRequested(target)}
                isSandboxActive={isSandboxActive}
                onRequest={(event) => requestForcePush(target, event)}
              />
            ))}
          </m.div>
        ) : null}
      </AnimatePresence>
      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconAlertTriangle size={16} className="text-destructive" />
              {forcePushConfirmTitle(confirmTarget?.label)}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {PUBLISH_RECOVERY_COPY.confirmBody}
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
              {PUBLISH_RECOVERY_COPY.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
