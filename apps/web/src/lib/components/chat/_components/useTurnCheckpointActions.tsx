"use client";

import { useState, type ReactNode } from "react";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@eva/backend";
import { toast } from "@eva/ui";
import { IconArrowBackUp, IconGitCompare } from "@tabler/icons-react";
import type { ChatMessageActionItem } from "@/lib/components/chat/ChatMessageActions";
import { ConfirmDialog } from "@/lib/components/quick-tasks/_components/ConfirmDialog";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";
import { TurnDiffDialog } from "./TurnDiffDialog";

/** Session-side context a message row needs to diff or restore a turn. */
export interface TurnCheckpointContext {
  sessionId: Id<"sessions">;
  repoId: Id<"githubRepos">;
}

type RevertStatus = FunctionReturnType<
  typeof api.sandbox.revertSessionToTurn
>["status"];

/** Why a restore did not happen, in the user's terms. */
const BLOCKED_REASON: Record<Exclude<RevertStatus, "restored">, string> = {
  not_running: "Start the sandbox first",
  turn_open: "Wait for the current turn to finish",
  dirty_worktree: "Commit or discard local changes first",
  sha_missing: "Checkpoint commit not found",
};

type RevertAction = ReturnType<
  typeof useAction<typeof api.sandbox.revertSessionToTurn>
>;

/**
 * Runs the restore and toasts the outcome. Lives outside the hook so the
 * `try`/`catch` never sits in a React Compiler-compiled function body.
 * Returns null when the call itself failed (the dialog stays open).
 */
async function runRevert(
  revert: RevertAction,
  sessionId: Id<"sessions">,
  messageId: string,
): Promise<RevertStatus | null> {
  try {
    const result = await revert({ sessionId, messageId });
    if (result.status === "restored") {
      const label = result.pushed
        ? "Workspace restored"
        : "Workspace restored — push pending";
      mutationSuccess(label, "turn-restore");
    } else {
      toast.message(BLOCKED_REASON[result.status], { id: "turn-restore" });
    }
    return result.status;
  } catch {
    mutationError("Couldn't restore the workspace", "turn-restore");
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
  // Latches on first open and never clears, so closing keeps its exit
  // animation. See `dialogs` below for why they are not mounted up front.
  const [dialogsMounted, setDialogsMounted] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const revert = useAction(api.sandbox.revertSessionToTurn);

  const { beforeSha, afterSha } = message;
  if (
    context === undefined ||
    message.role !== "assistant" ||
    beforeSha === undefined ||
    afterSha === undefined ||
    beforeSha === afterSha
  ) {
    return { items: [], dialogs: null };
  }

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
      label: "Diff this turn",
      icon: <IconGitCompare />,
      onClick: () => {
        setDialogsMounted(true);
        setDiffOpen(true);
      },
    },
    {
      key: "turn-restore",
      label: sandboxRunning
        ? "Restore to before this turn"
        : "Restore to before this turn (start the sandbox first)",
      icon: <IconArrowBackUp />,
      onClick: () => {
        setDialogsMounted(true);
        setRestoreOpen(true);
      },
      disabled: !sandboxRunning,
    },
  ];

  // Every code-changing turn owns two Radix dialog roots, so opening a long
  // transcript mounted hundreds of them to show none. Built on first open
  // instead; the row's actions are what pay for them.
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
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title="Restore to before this turn?"
        description="The workspace goes back to how it was before this turn, as a new commit on the session branch."
        detail="Later turns stay in history and the pull request shows the restore. Restore again on a later turn to undo it."
        confirmLabel="Restore"
        variant="destructive"
        onConfirm={() => {
          void handleRestore();
        }}
        isLoading={restoring}
      />
    </>
  );

  return { items, dialogs };
}
