import { spawnSync } from "child_process";
import { WORK_DIR } from "../config.js";

export const GIT_STEP_TIMEOUT_MS = 20_000;

/**
 * Runs git against the sandbox checkout and returns stdout+stderr combined.
 *
 * Synchronous on purpose: callers run it on shutdown paths where the event loop
 * is already being torn down, so an async child would never settle.
 * `GIT_TERMINAL_PROMPT=0` keeps a credential prompt from hanging the timeout.
 */
export function git(
  args: string[],
  timeoutMs: number = GIT_STEP_TIMEOUT_MS,
): { ok: boolean; out: string } {
  const result = spawnSync("git", ["-C", WORK_DIR, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const out = ((result.stdout || "") + (result.stderr || "")).trim();
  return { ok: result.status === 0, out };
}
