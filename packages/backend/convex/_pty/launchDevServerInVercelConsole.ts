"use node";

import type { SandboxHandle } from "../_sandbox/provider";
import {
  PREFER_OOM_KILL_LINE,
  workspaceDirShell,
} from "../_sandbox_runtime/helpers";
import { writeSandboxFile } from "../_sandbox_runtime/sandboxFiles";
import { ensureSwapFile } from "../_sandbox_runtime/swap";
import {
  buildFreePortLines,
  buildPortListenProbeCommand,
} from "../_sandbox_runtime/httpReadyProbe";
import {
  PACKAGE_HELPER_SCRIPT,
  pkgInstall,
} from "../_sandbox_runtime/packageManager";
import {
  EVA_ENV_SOURCE_CMD,
  tmuxNewSessionWithEvaEnv,
} from "../_sandbox/vercelEnvFile";
import { previewConsoleSessionName } from "./consoleSessionName";

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
  const sessionName = previewConsoleSessionName(ownerKey);
  const workspace = dir;

  await handle.exec(
    `${PACKAGE_HELPER_SCRIPT}\ncommand -v tmux >/dev/null 2>&1 || ${pkgInstall("tmux")}`,
    { cwd: "/", timeoutSeconds: 120 },
  );

  const portBusy = (
    await handle.exec(buildPortListenProbeCommand(port, "busy", "free"), {
      cwd: "/",
      timeoutSeconds: 10,
    })
  ).output.trim();
  if (portBusy === "busy") {
    console.log(
      `[vercel] launchDevServerInVercelConsole: port ${port} already listening on ${handle.id}; skipping`,
    );
    return;
  }

  await ensureSwapFile(handle);

  const script = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    PREFER_OOM_KILL_LINE,
    EVA_ENV_SOURCE_CMD,
    `cd ${workspace} 2>/dev/null || cd /vercel/sandbox || cd /tmp/repo || true`,
    `export INIT_CWD="$(pwd)"`,
    ...buildFreePortLines(port),
    'export NODE_OPTIONS="--max-old-space-size=6144${NODE_OPTIONS:+ $NODE_OPTIONS}"',
    devCommand,
  ].join("\n");
  const scriptPath = consoleLaunchScriptPath(sessionName);
  await writeSandboxFile(handle, scriptPath, script);
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
  await handle.exec(
    `tmux set-option -g mouse off; tmux set-option -t ${sessionName} mouse off; tmux set-option -t ${sessionName} alternate-screen off; tmux set-option -t ${sessionName} status off; tmux set-option -t ${sessionName} history-limit 50000`,
    { cwd: "/", timeoutSeconds: 5 },
  );

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
