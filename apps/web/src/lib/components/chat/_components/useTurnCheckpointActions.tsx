"use client";

import { useState, type ReactNode } from "react";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@eva/backend";
import { toast, ConfirmDialog } from "@vvedantb/ui";
import { IconArrowBackUp, IconGitCompare } from "@tabler/icons-react";
import type { ChatMessageActionItem } from "@/lib/components/chat/ChatMessageActions";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";
import {
  DIFF_TURN_LABEL,
  restoreTurnLabel,
  TURN_RESTORE_BLOCKED_REASON,
  TURN_RESTORE_COPY,
  TURN_RESTORE_FAILED,
  turnCheckpoint,
  turnRestoredLabel,
} from "@eva/shared/turnCheckpoint";
import { TurnDiffDialog } from "./TurnDiffDialog";

/** Session-side context a message row needs to diff or restore a turn. */
export interface TurnCheckpointContext {
  sessionId: Id<"sessions">;
  repoId: Id<"githubRepos">;
}

type RevertStatus = FunctionReturnType<
  typeof api.sandbox.revertSessionToTurn
>["status"];

type RevertAction = ReturnType<
  typeof useAction<typeof api.sandbox.revertSessionToTurn>
>;

async function runRevert(
  revert: RevertAction,
  sessionId: Id<"sessions">,
  messageId: string,
): Promise<RevertStatus | null> {
  try {
    const result = await revert({ sessionId, messageId });
    if (result.status === "restored") {
      mutationSuccess(turnRestoredLabel(result.pushed), "turn-restore");
    } else {
      toast.message(TURN_RESTORE_BLOCKED_REASON[result.status], {
        id: "turn-restore",
      });
    }
    return result.status;
  } catch {
    mutationError(TURN_RESTORE_FAILED, "turn-restore");
    return null;
  }
}

/**
 * Hover/context-menu actions for an assistant turn that changed code: view the
 * diff between its checkpoints, or restore the workspace to before it (a new
 * commit on the session branch — nothing is rewritten). Returns no items when
 * the turn carries no checkpoints or changed nothing.
 */
export function useTurnCheckpointActions({
  message,
  context,
  sandboxRunning,
}: {
  message: {
    _id: string;
    role: string;
    beforeSha?: string;
    afterSha?: string;
  };
  context: TurnCheckpointContext | undefined;
  sandboxRunning: boolean;
}): { items: ChatMessageActionItem[]; dialogs: ReactNode } {
  const [diffOpen, setDiffOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [dialogsMounted, setDialogsMounted] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const revert = useAction(api.sandbox.revertSessionToTurn);

  const checkpoint = turnCheckpoint(message);
  if (context === undefined || checkpoint === null) {
    return { items: [], dialogs: null };
  }
  const { beforeSha, afterSha } = checkpoint;

  const handleRestore = async () => {
    setRestoring(true);
    const result = await runRevert(revert, context.sessionId, message._id);
    setRestoring(false);
    if (result === null) return;
    setRestoreOpen(false);
  };

  const items: ChatMessageActionItem[] = [
    {
      key: "turn-diff",
      label: DIFF_TURN_LABEL,
      icon: <IconGitCompare />,
      onClick: () => {
        setDialogsMounted(true);
        setDiffOpen(true);
      },
    },
    {
      key: "turn-restore",
      label: restoreTurnLabel(sandboxRunning),
      icon: <IconArrowBackUp />,
      onClick: () => {
        setDialogsMounted(true);
        setRestoreOpen(true);
      },
      disabled: !sandboxRunning,
    },
  ];

  const dialogs = !dialogsMounted ? null : (
    <>
      <TurnDiffDialog
        open={diffOpen}
        onOpenChange={setDiffOpen}
        repoId={context.repoId}
        beforeSha={beforeSha}
        afterSha={afterSha}
      />
      <ConfirmDialog
        size="md"
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title={TURN_RESTORE_COPY.title}
        description={TURN_RESTORE_COPY.description}
        body={
          <p className="text-sm text-muted-foreground">
            {TURN_RESTORE_COPY.body}
          </p>
        }
        confirmLabel={TURN_RESTORE_COPY.confirmLabel}
        variant="destructive"
        onConfirm={() => {
          void handleRestore();
        }}
        pending={restoring}
      />
    </>
  );

  return { items, dialogs };
}
