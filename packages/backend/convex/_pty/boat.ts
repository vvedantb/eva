"use node";

import type { SandboxHandle } from "../_sandbox/provider";
import { getPreviewGrantPublicJwk, signPreviewGrant } from "../previewGrant";
import { PREVIEW_GRANT_PARAM } from "../previewGrantConfig";
import { ensurePreviewNavigationProxy } from "../_sandbox_runtime/previewProxy";
import { writeSandboxFile } from "../_sandbox_runtime/sandboxFiles";
import {
  BOAT_PTY_BRIDGE_HEALTH,
  BOAT_PTY_BRIDGE_PATH,
  BOAT_PTY_BRIDGE_PORT,
  BOAT_PTY_BRIDGE_SCRIPT,
  BOAT_PTY_PUBLIC_PORT,
} from "./boatBridge";

/** Starts the in-VM PTY bridge unless the current version already answers. */
async function ensureBridge(handle: SandboxHandle): Promise<void> {
  const healthy = await handle.exec(BOAT_PTY_BRIDGE_HEALTH, {
    timeoutSeconds: 10,
  });
  if (healthy.exitCode === 0) return;
  await writeSandboxFile(handle, BOAT_PTY_BRIDGE_PATH, BOAT_PTY_BRIDGE_SCRIPT);
  await handle.exec(
    `fuser -k ${BOAT_PTY_BRIDGE_PORT}/tcp 2>/dev/null || true`,
    { timeoutSeconds: 10 },
  );
  await handle.execDetached(
    `exec python3 ${BOAT_PTY_BRIDGE_PATH} ${BOAT_PTY_BRIDGE_PORT} >/tmp/eva-pty-bridge.log 2>&1`,
  );
  const up = await handle.exec(
    `for i in $(seq 1 20); do ${BOAT_PTY_BRIDGE_HEALTH} && exit 0; sleep 0.5; done; tail -20 /tmp/eva-pty-bridge.log >&2; exit 1`,
    { timeoutSeconds: 20 },
  );
  if (up.exitCode !== 0) {
    throw new Error(
      `Terminal bridge failed to start: ${up.output.slice(-500)}`,
    );
  }
}

/**
 * Browser WebSocket URL for a Boat sandbox terminal: the in-VM bridge behind
 * Eva's auth proxy on its own Boat port, with a fresh preview grant on the URL
 * (WebSocket upgrades cannot follow the grant→cookie redirect).
 *
 * Fails closed: without the preview-grant key the proxy would not gate, and an
 * ungated terminal is a public root shell.
 */
export async function connectBoatTerminal(
  handle: SandboxHandle,
  params: { repoId: string; subject: string },
): Promise<{ wsUrl: string }> {
  const publicKeyJwk = getPreviewGrantPublicJwk();
  await ensureBridge(handle);
  const proxyPort = await ensurePreviewNavigationProxy(
    handle,
    BOAT_PTY_BRIDGE_PORT,
    {
      publicKeyJwk,
      sandboxId: handle.id,
      repoId: params.repoId,
      webAppUrl: process.env.WEB_APP_URL ?? "",
      inject: false,
      authPort: BOAT_PTY_PUBLIC_PORT,
    },
    BOAT_PTY_PUBLIC_PORT,
  );
  const { url } = await handle.previewUrl(proxyPort);
  const wsUrl = new URL(url);
  wsUrl.protocol = "wss:";
  wsUrl.pathname = "/";
  wsUrl.searchParams.set(
    PREVIEW_GRANT_PARAM,
    await signPreviewGrant({
      sandboxId: handle.id,
      port: BOAT_PTY_PUBLIC_PORT,
      sub: params.subject,
    }),
  );
  return { wsUrl: wsUrl.toString() };
}
