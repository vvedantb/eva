import type { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";

/** The commits around a turn, when it changed code. */
export type TurnCheckpoint = { beforeSha: string; afterSha: string };

/** The turn's checkpoints, or null: a user message, a reply with none, or one that changed nothing. */
export function turnCheckpoint(message: { role: string; beforeSha?: string; afterSha?: string }): TurnCheckpoint | null {
  const { beforeSha, afterSha } = message;
  if (message.role !== "assistant" || beforeSha === undefined || afterSha === undefined || beforeSha === afterSha) return null;
  return { beforeSha, afterSha };
}

type RevertStatus = FunctionReturnType<typeof api.sandbox.revertSessionToTurn>["status"];

/** Why a restore did not happen, in the user's terms. */
export const TURN_RESTORE_BLOCKED_REASON: Record<Exclude<RevertStatus, "restored">, string> = {
  not_running: "Start the sandbox first",
  turn_open: "Wait for the current turn to finish",
  dirty_worktree: "Commit or discard local changes first",
  sha_missing: "Checkpoint commit not found",
};

/** The toast after a restore: a push may still be on its way. */
export function turnRestoredLabel(pushed: boolean): string {
  return pushed ? "Workspace restored" : "Workspace restored — push pending";
}

export const TURN_RESTORE_FAILED = "Couldn't restore the workspace";

/** The restore confirm: it is a new commit, so later turns stay and a later restore undoes it. */
export const TURN_RESTORE_COPY = {
  title: "Restore to before this turn?",
  description: "The workspace goes back to how it was before this turn, as a new commit on the session branch.",
  body: "Later turns stay in history and the pull request shows the restore. Restore again on a later turn to undo it.",
  confirmLabel: "Restore",
};

/** The menu labels: Restore needs a running sandbox, and says so while it is asleep. */
export const DIFF_TURN_LABEL = "Diff this turn";
export function restoreTurnLabel(sandboxRunning: boolean): string {
  return sandboxRunning ? "Restore to before this turn" : "Restore to before this turn (start the sandbox first)";
}

/** The diff screen's title and its short `before...after` line. */
export const TURN_DIFF_TITLE = "Changes in this turn";
export function turnDiffRange({ beforeSha, afterSha }: TurnCheckpoint): string {
  return `${beforeSha.slice(0, 7)}...${afterSha.slice(0, 7)}`;
}
