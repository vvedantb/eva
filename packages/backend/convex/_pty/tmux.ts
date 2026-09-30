/**
 * Shared tmux panes behind every browser terminal and the Preview Console, for
 * both providers: tmux keeps the process (and scrollback) across reconnects and
 * lets several tabs attach to one pane.
 */

import type { SandboxHandle } from "../_sandbox/provider";
import { ensureEvaEnvInteractiveHookScript } from "../_sandbox/vercelEnvFile";

/** Installs tmux when missing: dnf on Vercel (Amazon Linux), apt on Boat (Ubuntu ships it). */
export const INSTALL_TMUX =
  "command -v tmux >/dev/null 2>&1 || sudo dnf install -y tmux >/dev/null 2>&1 || sudo apt-get install -y tmux >/dev/null 2>&1";

/** Stable tmux session name for a Console/terminal pane id. */
export function tmuxSessionName(ptyInstanceId: string | undefined): string {
  const source =
    ptyInstanceId !== undefined && ptyInstanceId.length > 0
      ? ptyInstanceId
      : "terminal";
  const safe = source.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
  return `eva_${safe}`;
}

/** Ensures browser terminals attach to one shared tmux pane process (any provider). */
export async function ensureSharedTerminal(
  handle: SandboxHandle,
  ptyInstanceId: string | undefined,
): Promise<{ sessionName: string; isNewPty: boolean; initialOutput: string }> {
  const sessionName = tmuxSessionName(ptyInstanceId);
  await handle.exec(INSTALL_TMUX, { cwd: "/", timeoutSeconds: 120 });
  // Login/interactive bash (and new Console panes) should see repo secrets.
  try {
    await handle.exec(ensureEvaEnvInteractiveHookScript(), {
      cwd: "/",
      timeoutSeconds: 15,
    });
  } catch (error) {
    console.warn(
      `[pty] ensureEvaEnvInteractiveHook failed on ${handle.id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const existing = await handle.exec(
    `tmux has-session -t ${sessionName} >/dev/null 2>&1 && echo existing || echo missing`,
    { cwd: "/", timeoutSeconds: 5 },
  );
  const sessionExists = existing.output.trim() === "existing";
  return {
    sessionName,
    isNewPty: !sessionExists,
    initialOutput: sessionExists
      ? (
          await handle.exec(
            `tmux capture-pane -pt ${sessionName} -S -2000 2>/dev/null || true`,
            { cwd: "/", timeoutSeconds: 10 },
          )
        ).output
      : "",
  };
}
