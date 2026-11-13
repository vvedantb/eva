"use node";

/**
 * Vercel app Preview port map.
 *
 * Public auth proxy is always on 3000 (in the fixed 4-slot expose set).
 * 54321 stays free for local Supabase Kong. The app listens on the UI/logical
 * port when that is not 3000; when the UI port is 3000 the app listens on
 * 13000 so the proxy can own the public slot.
 *
 * Launch uses `pnpm|yarn|npm exec next|vite -p <listen>` (Eva-side only) so
 * hardcoded `next dev -p …` in customer package.json cannot steal the wrong port.
 */

import { z } from "zod";
import { DEFAULT_PREVIEW_PORT, DESKTOP_PORT, EDITOR_PORT } from "@eva/shared";
import type { SandboxHandle } from "../_sandbox/provider";
import { detectPackageManager } from "./devServer";
import { execHandle, workspaceDirShell } from "./helpers";

const packageJsonDepsSchema = z
  .object({
    dependencies: z.record(z.string(), z.string()).catch({}),
    devDependencies: z.record(z.string(), z.string()).catch({}),
  })
  .catch({ dependencies: {}, devDependencies: {} });

/** Public auth-proxy port for all Vercel app/dev Previews. */
export const VERCEL_PREVIEW_PROXY_PORT = DEFAULT_PREVIEW_PORT;

/** Listen port when the logical/UI port is 3000 (proxy owns that slot). */
export const VERCEL_APP_INTERNAL_PORT = 13000;

function isUsablePort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

/** Absolute shell path to the package root, defaulting to the workspace root. */
function packageDirShell(rootDir: string): string {
  const workspaceRoot = workspaceDirShell();
  return rootDir ? `${workspaceRoot}/${rootDir}` : workspaceRoot;
}

/**
 * Where the app listens inside a Vercel sandbox for a given UI/logical port.
 * Proxy always owns 3000; app uses 13000 in that case, otherwise the logical port.
 */
export function vercelAppListenPort(logicalPort: number): number {
  const logical = isUsablePort(logicalPort)
    ? logicalPort
    : VERCEL_PREVIEW_PROXY_PORT;
  if (logical === VERCEL_PREVIEW_PROXY_PORT) {
    return VERCEL_APP_INTERNAL_PORT;
  }
  // Desktop/editor/supabase public slots are never app listen ports.
  if (
    logical === DESKTOP_PORT ||
    logical === EDITOR_PORT ||
    logical === 54321
  ) {
    return VERCEL_APP_INTERNAL_PORT;
  }
  return logical;
}

export type VercelDevFramework = "next" | "vite" | "unknown";

/** Detects Next vs Vite from package.json deps (Eva launch path only). */
export async function detectVercelDevFramework(
  handle: SandboxHandle,
  rootDir: string,
): Promise<VercelDevFramework> {
  const dir = packageDirShell(rootDir);
  try {
    const raw = await execHandle(
      handle,
      `cat ${dir}/package.json 2>/dev/null || echo "{}"`,
      5,
    );
    const pkg = packageJsonDepsSchema.parse(JSON.parse(raw));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if ("next" in deps) return "next";
    if ("vite" in deps) return "vite";
  } catch {
    // fall through
  }
  return "unknown";
}

/**
 * Eva-owned console command that binds the framework CLI to `listenPort`.
 * Does not edit the customer repo — only what Eva runs in the sandbox.
 */
export function vercelForcedFrameworkDevCommand(
  packageManager: string,
  rootDir: string,
  listenPort: number,
  framework: VercelDevFramework,
): string | null {
  const dir = packageDirShell(rootDir);
  const env = `HOSTNAME=0.0.0.0 PORT=${listenPort}`;
  if (framework === "next") {
    const bin =
      packageManager === "npm"
        ? "npx --yes next"
        : `${packageManager} exec next`;
    return `cd ${dir} && ${env} ${bin} dev -H 0.0.0.0 -p ${listenPort}`;
  }
  if (framework === "vite") {
    const bin =
      packageManager === "npm"
        ? "npx --yes vite"
        : `${packageManager} exec vite`;
    return `cd ${dir} && ${env} ${bin} --host 0.0.0.0 --port ${listenPort}`;
  }
  return null;
}

/** Rewrite PORT=… in a fallback launch command to the Vercel listen port. */
function withListenPortInCommand(
  devCommand: string,
  listenPort: number,
): string {
  if (/\bPORT=\d+\b/.test(devCommand)) {
    return devCommand.replace(/\bPORT=\d+\b/, `PORT=${listenPort}`);
  }
  return `PORT=${listenPort} ${devCommand}`;
}

/**
 * Resolves the Console launch command for a Vercel app Preview.
 * Prefers `exec next|vite -p <listen>`; falls back to rewriting PORT= in
 * the session's existing command when the framework is unknown.
 */
export async function resolveVercelConsoleDevCommand(
  handle: SandboxHandle,
  rootDir: string,
  logicalPort: number,
  fallbackDevCommand: string,
): Promise<{ listenPort: number; devCommand: string }> {
  const listenPort = vercelAppListenPort(logicalPort);
  const framework = await detectVercelDevFramework(handle, rootDir);
  if (framework !== "unknown") {
    const pm = await detectPackageManager(handle, rootDir);
    const forced = vercelForcedFrameworkDevCommand(
      pm,
      rootDir,
      listenPort,
      framework,
    );
    if (forced) {
      return { listenPort, devCommand: forced };
    }
  }
  return {
    listenPort,
    devCommand: withListenPortInCommand(fallbackDevCommand, listenPort),
  };
}
