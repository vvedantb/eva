"use node";

import type { SandboxHandle } from "../_sandbox/provider";
import { defaultTerminalPtyId } from "../_sandbox_runtime/devServer";
import { workspaceDirShell } from "../_sandbox_runtime/helpers";
import { ensureSwapFile } from "../_sandbox_runtime/swap";
import {
  EVA_ENV_FILE,
  tmuxNewSessionWithEvaEnv,
} from "../_sandbox/vercelEnvFile";
import { tmuxSessionName } from "./vercel";

/**
 * Per-`sessionName` so a linked repo's console session (a distinct tmux
 * session from the primary's, see `launchLinkedRepoDevServerInVercelConsole`)
 * never overwrites the primary's still-running launch script.
 */
function consoleLaunchScriptPath(sessionName: string): string {
  return `/tmp/eva-console-dev-${sessionName}.sh`;
}

/**
 * Starts the app dev server inside the Preview Console's shared tmux session
 * so logs stream into the Console pane (not `/tmp/devserver.log`).
 *
 * Safe to call when the browser already attached: send-keys goes into the
 * existing session. Skips when the listen port is already open.
 *
 * `dir` defaults to the primary repo's workspace root. A linked repo's own
 * console session (see `launchLinkedRepoDevServerInVercelConsole`) passes its
 * own clone directory instead, via a distinct `ownerKey` so it never fights
 * the primary's tmux session.
 */
export async function launchDevServerInVercelConsole(
  handle: SandboxHandle,
  ownerKey: string,
  devCommand: string,
  port: number,
  dir: string = workspaceDirShell(),
): Promise<void> {
  const sessionName = tmuxSessionName(defaultTerminalPtyId(ownerKey));
  const workspace = dir;

  await handle.exec(
    "command -v tmux >/dev/null 2>&1 || sudo dnf install -y tmux >/dev/null 2>&1",
    { cwd: "/", timeoutSeconds: 120 },
  );

  const portBusy = (
    await handle.exec(
      [
        `if command -v ss >/dev/null 2>&1; then ss -ltn 2>/dev/null | grep -q ":${port} " && echo busy && exit 0; fi`,
        `if command -v lsof >/dev/null 2>&1; then lsof -iTCP:${port} -sTCP:LISTEN >/dev/null 2>&1 && echo busy && exit 0; fi`,
        "echo free",
      ].join("; "),
      { cwd: "/", timeoutSeconds: 10 },
    )
  ).output.trim();
  if (portBusy === "busy") {
    console.log(
      `[vercel] launchDevServerInVercelConsole: port ${port} already listening on ${handle.id}; skipping`,
    );
    return;
  }

  // The single Console launcher for sessions, quick tasks and project chats —
  // and the only dev-server gate on paths that never booted through
  // ensureSandboxRunning (preview self-heal on a lazily resumed VM, which comes
  // up with no swap because stop released it). A cold `next dev` compile is the
  // second half of the stack that OOM-killed the Convex backend, so make sure
  // there is swap before starting one. No-op exec when swap is already active.
  await ensureSwapFile(handle);

  const script = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `[ -f ${EVA_ENV_FILE} ] && . ${EVA_ENV_FILE}`,
    `cd ${workspace} 2>/dev/null || cd /vercel/sandbox || cd /tmp/repo || true`,
    `export INIT_CWD="$(pwd)"`,
    // Free the port if a previous background launch left something behind.
    `if command -v fuser >/dev/null 2>&1; then fuser -k ${port}/tcp >/dev/null 2>&1 || true`,
    `elif command -v lsof >/dev/null 2>&1; then for p in $(lsof -ti :${port} 2>/dev/null || true); do kill "$p" 2>/dev/null || true; done`,
    "fi",
    // Cap the dev server's V8 heap: one leaky Next dev compile at ~5.5GB RSS
    // was enough to trigger kernel OOM kills of unrelated processes on a 16GB
    // VM. A clean heap error is the recoverable failure — the preview
    // self-heal (ensureSessionPreviewServices) relaunches the server. Ours
    // goes first so an env- or repo-provided NODE_OPTIONS still wins.
    'export NODE_OPTIONS="--max-old-space-size=6144${NODE_OPTIONS:+ $NODE_OPTIONS}"',
    devCommand,
  ].join("\n");
  const scriptPath = consoleLaunchScriptPath(sessionName);
  await handle.writeFile(scriptPath, script);
  await handle.exec(`chmod +x ${scriptPath}`, {
    cwd: "/",
    timeoutSeconds: 5,
  });

  const hasSession = (
    await handle.exec(
      `tmux has-session -t ${sessionName} >/dev/null 2>&1 && echo yes || echo no`,
      { cwd: "/", timeoutSeconds: 5 },
    )
  ).output.trim();
  if (hasSession !== "yes") {
    await handle.exec(tmuxNewSessionWithEvaEnv(sessionName, workspace), {
      cwd: "/",
      timeoutSeconds: 15,
    });
  }
  // mouse off always — tmux mouse mode breaks Console into history/copy-mode.
  // alternate-screen off keeps output in xterm scrollback (visible scrollbar).
  // status off: the status bar shrinks tmux's scroll region by one row, and
  // xterm only pushes scrolled lines into scrollback when the scroll spans the
  // full viewport — with the bar on, the Console scrollbar never appears.
  await handle.exec(
    `tmux set-option -g mouse off; tmux set-option -t ${sessionName} mouse off; tmux set-option -t ${sessionName} alternate-screen off; tmux set-option -t ${sessionName} status off; tmux set-option -t ${sessionName} history-limit 50000`,
    { cwd: "/", timeoutSeconds: 5 },
  );

  // Run via script path so send-keys needs no shell-escaping of the command.
  await handle.exec(
    `tmux send-keys -t ${sessionName} ${scriptPath} Enter`,
    { cwd: "/", timeoutSeconds: 10 },
  );
  console.log(
    `[vercel] launchDevServerInVercelConsole: started in tmux ${sessionName} on ${handle.id} port=${port}`,
  );
}

/**
 * Starts one linked repo's dev server in its own Preview Console tmux session
 * (`ownerKey` should be unique per repo, e.g. `session-<id>-<repoName>`, so it
 * never shares a tmux session — or launch script — with the primary's).
 * Sources that repo's own `.env.eva` first when present, never the
 * sandbox-wide env file, since linked-repo env vars are scoped to that repo
 * alone (see `linkedRepos.ts`'s `prepareLinkedRepo`).
 *
 * There is no framework auto-detection here, unlike the primary's
 * `resolveVercelConsoleDevCommand` — a linked repo only ever gets a dev server
 * when its `sessionRepos` row has an explicit `devCommand` and `devPort`.
 *
 * `devPort` needs no registration at sandbox-create time: Vercel exposes a
 * fixed four-port set (`VERCEL_DEFAULT_EXPOSED_PORTS`, all four already taken
 * by the auth proxy, editor, desktop and Supabase) and every app port —
 * including the primary's own — is reached through the in-sandbox navigation
 * proxy on 3000 instead (`execution.ts`'s `ensurePreviewNavigationProxy`). So
 * a linked repo's dev server just listens on its own internal port.
 */
export async function launchLinkedRepoDevServerInVercelConsole(
  handle: SandboxHandle,
  ownerKey: string,
  dir: string,
  devCommand: string,
  devPort: number,
): Promise<void> {
  const fullDevCommand = `if [ -f .env.eva ]; then set -a; . ./.env.eva; set +a; fi; HOSTNAME=0.0.0.0 PORT=${devPort} ${devCommand}`;
  await launchDevServerInVercelConsole(
    handle,
    ownerKey,
    fullDevCommand,
    devPort,
    dir,
  );
}
