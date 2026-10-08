import { spawnSync } from "child_process";
import { WORK_DIR } from "../config.js";

export const GIT_STEP_TIMEOUT_MS = 20_000;

/**
 * Runs git against the sandbox checkout (or `cwd`) and returns stdout+stderr
 * combined.
 *
 * Synchronous on purpose: callers run it on shutdown paths where the event loop
 * is already being torn down, so an async child would never settle.
 * `GIT_TERMINAL_PROMPT=0` keeps a credential prompt from hanging the timeout.
 */
export function git(
  args: string[],
  {
    cwd = WORK_DIR,
    timeoutMs = GIT_STEP_TIMEOUT_MS,
  }: { cwd?: string; timeoutMs?: number } = {},
): { ok: boolean; out: string } {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const out = ((result.stdout || "") + (result.stderr || "")).trim();
  return { ok: result.status === 0, out };
}

/** Abbreviated name of the checked-out branch ("HEAD" when detached), or "" when git fails. */
export function readCurrentBranch(
  options: { timeoutMs?: number } = {},
): string {
  const result = git(["rev-parse", "--abbrev-ref", "HEAD"], options);
  return result.ok ? result.out : "";
}
