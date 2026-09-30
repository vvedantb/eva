"use node";

import type { Sandbox } from "@vercel/sandbox";

/** Browser WebSockets cannot set headers — pass the interactive token as a query param. */
function buildVercelInteractiveWsUrl(url: string, token: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("token", token);
  return parsed.toString();
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
