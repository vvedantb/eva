"use node";

import type { SandboxHandle } from "../_sandbox/provider";
import {
  EVA_CONFIG_PATH,
  findEvaApp,
  parseEvaConfig,
} from "../_evaConfig/config";
import { execHandle } from "./helpers";

/**
 * Written after startup commands succeed. Its content is the startup
 * fingerprint of the commands that ran (see computeStartupFingerprint); an
 * empty marker predates fingerprints and still counts as done.
 */
export const STARTUP_MARKER_PATH = "/tmp/.startup-commands-done";

const NO_MARKER = "__eva_no_startup_marker__";

/** Marker content, or null when startup commands have not completed. */
export async function readStartupMarker(
  sandbox: SandboxHandle,
): Promise<string | null> {
  try {
    const out = await execHandle(
      sandbox,
      `cat ${STARTUP_MARKER_PATH} 2>/dev/null || printf %s ${NO_MARKER}`,
      5,
    );
    const content = out.trim();
    return content === NO_MARKER ? null : content;
  } catch {
    return null;
  }
}

/** True when the marker says these exact startup commands already ran. */
export function startupMarkerMatches(
  marker: string | null,
  fingerprint: string,
): boolean {
  if (marker === null) return false;
  return marker === "" || marker === fingerprint;
}

export async function writeStartupMarker(
  sandbox: SandboxHandle,
  fingerprint: string,
): Promise<void> {
  await execHandle(
    sandbox,
    `printf %s ${fingerprint} > ${STARTUP_MARKER_PATH}`,
    5,
  );
}

/**
 * The checked-out branch's own commands for this app, from `.eva/config.json`
 * in the sandbox (so unpushed edits count). Null when the branch has no valid
 * file or no entry for the app — callers then use the Convex cache, which
 * mirrors the default branch.
 */
export async function readBranchAppCommands(
  sandbox: SandboxHandle,
  rootDirectory: string | undefined,
): Promise<{ startup: string[]; background: string[] } | null> {
  let text: string;
  try {
    text = await execHandle(
      sandbox,
      `cat ${EVA_CONFIG_PATH} 2>/dev/null || true`,
      5,
    );
  } catch {
    return null;
  }
  if (text.trim() === "") return null;
  const parsed = parseEvaConfig(text);
  if (!parsed.ok) {
    console.warn(`[sandbox] branch ${parsed.error} — using cached commands`);
    return null;
  }
  const app = findEvaApp(parsed.value, rootDirectory);
  if (!app) return null;
  return { startup: app.startup, background: app.background };
}
