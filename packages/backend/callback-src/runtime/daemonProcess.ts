import { readFileSync, unlinkSync, writeFileSync } from "fs";
import {
  resolveLegacySessionDaemonPaths,
  type DaemonPaths,
} from "../providers/daemonPaths.js";
import type { JsonValue } from "../types.js";

const CALLBACK_FINGERPRINT_PATH = "/tmp/eva-callback-fp";

/** Shared warm-daemon poll knobs. Callers still decide what "busy" means. */
export const DAEMON_CLAIM_POLL_TIMING = {
  idleExitMs: 45 * 60 * 1000,
  fencePollIntervalMs: 5000,
  fastPollIntervalMs: 50,
  idlePollIntervalMs: 1000,
  fastPollWindowMs: 30_000,
} as const;

/** Fast while a turn is busy or just finished; idle backoff otherwise. */
export function selectClaimPollIntervalMs(params: {
  busy: boolean;
  lastIdleActivityAtMs: number;
  now?: number;
}): number {
  const now = params.now ?? Date.now();
  const recentlyActive =
    now - params.lastIdleActivityAtMs <
    DAEMON_CLAIM_POLL_TIMING.fastPollWindowMs;
  return params.busy || recentlyActive
    ? DAEMON_CLAIM_POLL_TIMING.fastPollIntervalMs
    : DAEMON_CLAIM_POLL_TIMING.idlePollIntervalMs;
}

/** Resolves after `ms`. Shared by daemon poll loops and question waits. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** True when `pid` refers to a live process this user can signal. */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort `/proc/.../oom_score_adj` write. Callers choose the score;
 * missing procfs or privilege just no-ops.
 */
export function writeOomScoreAdj(
  target: "self" | number,
  score: string,
): void {
  if (target !== "self" && !target) return;
  const path =
    target === "self"
      ? "/proc/self/oom_score_adj"
      : `/proc/${target}/oom_score_adj`;
  try {
    writeFileSync(path, score);
  } catch {
    /* Non-Linux and restricted procfs fail open. */
  }
}

/**
 * True when a newer callback bundle was uploaded while this daemon is running.
 * The daemon then stops claiming so the next prewarm can spawn with fresh code.
 */
export function callbackBundleWentStale(expectedFingerprint: string): boolean {
  if (!expectedFingerprint) return false;
  try {
    return (
      readFileSync(CALLBACK_FINGERPRINT_PATH, "utf8").trim() !==
      expectedFingerprint
    );
  } catch {
    return false;
  }
}

/** Reads a pidfile; NaN when missing or unreadable. */
export function readPidFromFile(pidPath: string): number {
  try {
    return Number(readFileSync(pidPath, "utf8").trim());
  } catch {
    return Number.NaN;
  }
}

/** Prefixes Convex mutation args with the entity this daemon owns. */
export function buildEntityMutationArgs(
  entityIdField: string | undefined,
  entityId: string | undefined,
  fields: Record<string, JsonValue>,
): Record<string, JsonValue> {
  return {
    [entityIdField ?? "sessionId"]: entityId ?? "",
    ...fields,
  };
}

export type DaemonPidfileClaim =
  | { status: "claimed" }
  | { status: "rival_alive"; rivalPid: number };

/**
 * First-writer-wins pidfile claim. A dead pid is overwritten; a live rival
 * is left untouched. Callers decide whether to exit on `rival_alive`.
 */
export function claimDaemonPidfileBoot(params: {
  paths: DaemonPaths;
  entityId: string;
  optsSig: string;
  currentPid?: number;
}): DaemonPidfileClaim {
  const currentPid = params.currentPid ?? process.pid;
  const rivalPid = readPidFromFile(params.paths.pid);
  if (
    !Number.isNaN(rivalPid) &&
    rivalPid !== currentPid &&
    pidAlive(rivalPid)
  ) {
    return { status: "rival_alive", rivalPid };
  }
  writeFileSync(params.paths.pid, String(currentPid));
  writeFileSync(params.paths.entity, params.entityId);
  writeFileSync(params.paths.opts, params.optsSig);
  return { status: "claimed" };
}

/**
 * Removes marker files only while this process still owns the pidfile.
 * A deposed daemon must never unlink a rival's claim.
 */
export function cleanOwnedDaemonMarkers(params: {
  paths: DaemonPaths;
  currentPid?: number;
  includeLegacySessionPaths: boolean;
}): void {
  const currentPid = params.currentPid ?? process.pid;
  if (readPidFromFile(params.paths.pid) !== currentPid) return;
  const legacy = params.includeLegacySessionPaths
    ? resolveLegacySessionDaemonPaths()
    : null;
  const targets = [
    params.paths.pid,
    params.paths.entity,
    params.paths.opts,
    ...(legacy ? [legacy.pid, legacy.entity, legacy.opts] : []),
  ];
  for (const path of targets) {
    try {
      unlinkSync(path);
    } catch {
      /* ignore */
    }
  }
}

/** Periodic pidfile fence. Callers own the idle-exit action (process.exit vs stop). */
export function startDaemonDepositionFence(params: {
  readOwnerPid: () => number;
  hasActiveWork: () => boolean;
  pollIntervalMs: number;
  log: (message: string) => void;
  logPrefix: string;
  onDeposedIdle: () => void;
}): { stop: () => void } {
  let deposedLogged = false;
  const timer = setInterval(() => {
    const owner = params.readOwnerPid();
    if (owner === process.pid) {
      deposedLogged = false;
      return;
    }
    const ownerLabel = Number.isNaN(owner) ? "none" : String(owner);
    if (params.hasActiveWork()) {
      if (!deposedLogged) {
        deposedLogged = true;
        params.log(
          `${params.logPrefix}: deposed (pidfile owner=${ownerLabel}) — exiting after active turn`,
        );
      }
      return;
    }
    params.log(
      `${params.logPrefix}: deposed (pidfile owner=${ownerLabel}) — exiting`,
    );
    params.onDeposedIdle();
  }, params.pollIntervalMs);
  timer.unref?.();
  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}
