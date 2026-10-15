import { readFileSync, unlinkSync, writeFileSync } from "fs";
import {
  CALLBACK_SCRIPT_FP,
  DAEMON_OPTS_SIG,
  ENTITY_ID,
  ENTITY_ID_FIELD,
} from "../config.js";
import {
  resolveLegacySessionDaemonPaths,
  type DaemonPaths,
} from "../providers/daemonPaths.js";
import { refreshDaemonGithubTokenFromEnv } from "../providers/githubToken.js";
import type { JsonValue } from "../types.js";
import { log } from "../utils.js";
import { runPreflightHeartbeat } from "./heartbeats.js";

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
 * True when `pid` is a live CALLBACK RUNNER, not merely a live process.
 *
 * Marker files under /tmp outlive a Vercel stop/resume, but the VM reboots and
 * pid allocation restarts from 1, so a pidfile written before the stop routinely
 * names one of the services the resume spawned. `pidAlive` alone then reports a
 * rival that does not exist and this daemon exits at boot, leaving the entity
 * with no daemon at all. argv is the one thing a recycled pid cannot fake; an
 * unreadable procfs falls back to the `kill -0` verdict.
 */
export function isCallbackRunnerPid(pid: number): boolean {
  if (!pidAlive(pid)) return false;
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").includes(
      "run-design.mjs",
    );
  } catch {
    return true;
  }
}

/**
 * Best-effort `/proc/.../oom_score_adj` write. Callers choose the score;
 * missing procfs or privilege just no-ops.
 */
export function writeOomScoreAdj(target: "self" | number, score: string): void {
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

/** {@link callbackBundleWentStale} for this daemon's own bundle fingerprint. */
export function callbackScriptWentStale(): boolean {
  return callbackBundleWentStale(CALLBACK_SCRIPT_FP);
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

/** {@link buildEntityMutationArgs} for the entity this daemon process owns. */
export function entityMutationArgs(
  fields: Record<string, JsonValue>,
): Record<string, JsonValue> {
  return buildEntityMutationArgs(ENTITY_ID_FIELD, ENTITY_ID, fields);
}

export type DaemonPidfileClaim =
  | { status: "claimed" }
  | { status: "rival_alive"; rivalPid: number };

/**
 * First-writer-wins pidfile claim. A dead pid is overwritten; a live rival
 * is left untouched. Callers decide whether to exit on `rival_alive`.
 *
 * "Live rival" means a live callback runner ({@link isCallbackRunnerPid}), not
 * any live pid — a pidfile that survived a stop/resume names a pid the reboot
 * gave to something else.
 */
export function claimDaemonPidfileBoot(params: {
  paths: DaemonPaths;
  entityId: string;
  optsSig: string;
  currentPid?: number;
  /** Seam for tests; production always identifies the rival by its argv. */
  isRival?: (pid: number) => boolean;
}): DaemonPidfileClaim {
  const currentPid = params.currentPid ?? process.pid;
  const isRival = params.isRival ?? isCallbackRunnerPid;
  const rivalPid = readPidFromFile(params.paths.pid);
  if (!Number.isNaN(rivalPid) && rivalPid !== currentPid && isRival(rivalPid)) {
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

/**
 * {@link cleanOwnedDaemonMarkers} for this daemon. Session-scoped daemons also
 * clean the legacy session paths.
 */
export function cleanOwnedMarkers(paths: DaemonPaths): void {
  cleanOwnedDaemonMarkers({
    paths,
    includeLegacySessionPaths: ENTITY_ID_FIELD === "sessionId",
  });
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

/**
 * Shared warm-daemon boot: pidfile claim, deposition fence, preflight
 * heartbeat, then a GitHub installation-token refresh (sessions may push).
 *
 * Fence part 1 (boot claim): if a live rival already owns the pidfile, exit
 * without touching its marker files. First writer wins. A dead pid in the file
 * (e.g. after KILL_PRIOR_AGENT_PROCESSES_CMD) is overwritten.
 *
 * Fence part 2 (deposition): concurrent launches race the multi-second gap
 * between the launcher's alive-check and the pidfile write, so several daemons
 * can boot for one entity (observed in prod: 5 daemons flip-flopping one
 * streaming row). A launch racing past the boot claim (or an optsmismatch
 * respawn) overwrites the pidfile; the deposed daemon must exit or it lives
 * forever, double-claiming turns. Deferred while `hasActiveWork` so work is
 * never killed mid-flight — the rival idles on claim polling meanwhile. A
 * missing pidfile also means deposed (a kill+respawn removed it; the successor
 * will claim it).
 */
export async function bootWarmDaemon(params: {
  paths: DaemonPaths;
  logPrefix: string;
  hasActiveWork: () => boolean;
  onDeposedIdle: () => void;
}): Promise<void> {
  const { paths, logPrefix } = params;
  const bootClaim = claimDaemonPidfileBoot({
    paths,
    entityId: ENTITY_ID ?? "",
    optsSig: DAEMON_OPTS_SIG,
  });
  if (bootClaim.status === "rival_alive") {
    log(
      `${logPrefix}: rival daemon pid=${bootClaim.rivalPid} already owns ${paths.pid} — exiting`,
    );
    process.exit(0);
  }
  startDaemonDepositionFence({
    readOwnerPid: () => readPidFromFile(paths.pid),
    hasActiveWork: params.hasActiveWork,
    pollIntervalMs: DAEMON_CLAIM_POLL_TIMING.fencePollIntervalMs,
    log,
    logPrefix,
    onDeposedIdle: params.onDeposedIdle,
  });
  if (!(await runPreflightHeartbeat())) {
    log(`${logPrefix}: preflight failed`);
    process.exit(1);
  }
  await refreshDaemonGithubTokenFromEnv();
}
