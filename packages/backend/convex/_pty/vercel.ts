"use node";

import type { Sandbox } from "@vercel/sandbox";
import type { SandboxHandle } from "../_sandbox/provider";
import { ensureEvaEnvInteractiveHookScript } from "../_sandbox/vercelEnvFile";
import {
  PACKAGE_HELPER_SCRIPT,
  pkgInstall,
} from "../_sandbox_runtime/packageManager";
import { tmuxSessionName } from "./consoleSessionName";
import { errorText } from "../_shared/errors";

/** Browser WebSockets cannot set headers — pass the interactive token as a query param. */
function buildVercelInteractiveWsUrl(url: string, token: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("token", token);
  return parsed.toString();
}

/** Ensures Vercel browser terminals attach to one shared pane process. */
export async function ensureVercelSharedTerminal(
  handle: SandboxHandle,
  ptyInstanceId: string | undefined,
): Promise<{ sessionName: string; isNewPty: boolean; initialOutput: string }> {
  const sessionName = tmuxSessionName(ptyInstanceId);
  await handle.exec(
    `${PACKAGE_HELPER_SCRIPT}\ncommand -v tmux >/dev/null 2>&1 || ${pkgInstall("tmux")}`,
    { cwd: "/", timeoutSeconds: 120 },
  );
  // Login/interactive bash (and new Console panes) should see repo secrets.
  try {
    await handle.exec(ensureEvaEnvInteractiveHookScript(), {
      cwd: "/",
      timeoutSeconds: 15,
    });
  } catch (error) {
    console.warn(
      `[vercel] ensureEvaEnvInteractiveHook failed on ${handle.id}: ${errorText(
        error,
      )}`,
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

/** Opens Vercel's controller-hosted PTY and returns a browser-connectable WebSocket URL. */
export async function connectVercelInteractive(
  sandbox: Sandbox,
  ptySessionId: string,
): Promise<{ wsUrl: string; ptySessionId: string; authToken: string }> {
  const { url, token } = await sandbox.openInteractive();
  return {
    wsUrl: buildVercelInteractiveWsUrl(url, token),
    ptySessionId,
    authToken: token,
  };
}
