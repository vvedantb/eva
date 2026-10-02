import type { SandboxIdlePauseMode } from "@eva/shared";

export interface AutoWakeInput {
  /** `appSettings.sandboxIdlePauseMode`; undefined while the query loads. */
  mode: SandboxIdlePauseMode | undefined;
  /** Session `status`, task `reviewTaskSandboxStatus` or project equivalent. */
  status: string | undefined;
  /** The entity has a sandbox to resume (never-started entities do not auto-wake). */
  hasSandbox: boolean;
  /** Sessions only: the last wake failed; never retry a failure automatically. */
  sandboxError: string | undefined;
  /** A VM tab (preview, terminal, editor, …) is what the user is looking at. */
  tabOpen: boolean;
  /** Archived / PR-terminal surfaces never wake. */
  readOnly: boolean;
  /** An agent run or build owns the sandbox right now. */
  busy: boolean;
}

/**
 * Whether landing on a sandbox tab should resume a paused sandbox by itself.
 * Only when idle pause is fully on: with the setting off (or in dry-run) the
 * user keeps today's explicit "Wake up Eva" button, so flipping the flag back
 * restores the old behaviour exactly.
 */
export function shouldAutoWake(input: AutoWakeInput): boolean {
  return (
    input.mode === "on" &&
    input.status === "closed" &&
    input.hasSandbox &&
    input.sandboxError === undefined &&
    input.tabOpen &&
    !input.readOnly &&
    !input.busy
  );
}
