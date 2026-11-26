import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "bun:test";
import { stubEnv, unstubAllEnvs } from "../../tests/_helpers/env";
import { freshModules } from "./freshModules";
import {
  DAEMON_CLAIM_POLL_TIMING,
  buildEntityMutationArgs,
  callbackBundleWentStale,
  claimDaemonPidfileBoot,
  cleanOwnedDaemonMarkers,
  isCallbackRunnerPid,
  pidAlive,
  readPidFromFile,
  selectClaimPollIntervalMs,
  startDaemonDepositionFence,
  writeOomScoreAdj,
} from "../runtime/daemonProcess.js";

test("pidAlive reports this process as live and a fake pid as dead", () => {
  expect(pidAlive(process.pid)).toBe(true);
  expect(pidAlive(2 ** 31 - 1)).toBe(false);
});

test("writeOomScoreAdj fails open on a missing pid", () => {
  expect(() => writeOomScoreAdj(2 ** 31 - 1, "300")).not.toThrow();
});

test("callbackBundleWentStale is false when the fingerprint env is empty", () => {
  expect(callbackBundleWentStale("")).toBe(false);
});

test("selectClaimPollIntervalMs is busy mid-turn, fast after a turn, idle otherwise", () => {
  const now = 100_000;
  expect(
    selectClaimPollIntervalMs({
      busy: true,
      lastIdleActivityAtMs: now - 1_000,
      now,
    }),
  ).toBe(DAEMON_CLAIM_POLL_TIMING.busyPollIntervalMs);
  expect(
    selectClaimPollIntervalMs({
      busy: false,
      lastIdleActivityAtMs: now - 1_000,
      now,
    }),
  ).toBe(DAEMON_CLAIM_POLL_TIMING.fastPollIntervalMs);
  expect(
    selectClaimPollIntervalMs({
      busy: false,
      lastIdleActivityAtMs: now - DAEMON_CLAIM_POLL_TIMING.fastPollWindowMs - 1,
      now,
    }),
  ).toBe(DAEMON_CLAIM_POLL_TIMING.idlePollIntervalMs);
});

test("readPidFromFile returns NaN when the file is missing", () => {
  expect(readPidFromFile("/tmp/eva-missing-daemon.pid")).toBeNaN();
});

test("buildEntityMutationArgs prefixes the entity field", () => {
  expect(
    buildEntityMutationArgs("taskId", "t1", { model: "claude:sonnet" }),
  ).toEqual({ taskId: "t1", model: "claude:sonnet" });
});

test("entityMutationArgs prefixes the entity this daemon owns", async () => {
  // config.ts reads the entity env at import time, so load a fresh module graph.
  stubEnv("ENTITY_ID_FIELD", "taskId");
  stubEnv("ENTITY_ID", "t1");
  freshModules();
  try {
    const fresh = await import("../runtime/daemonProcess.js");
    expect(fresh.entityMutationArgs({ model: "claude:sonnet" })).toEqual({
      taskId: "t1",
      model: "claude:sonnet",
    });
  } finally {
    unstubAllEnvs();
    freshModules();
  }
});

let rival: ChildProcess | null = null;

afterEach(() => {
  rival?.kill();
  rival = null;
});

test("claimDaemonPidfileBoot leaves a live rival untouched", async () => {
  // A real process whose argv names the callback runner, as a rival daemon's does.
  rival = spawn(process.execPath, [
    "-e",
    "setTimeout(() => {}, 5000)",
    "run-design.mjs",
  ]);
  await once(rival, "spawn");
  const rivalPid = rival.pid;
  if (rivalPid === undefined) throw new Error("rival did not spawn");
  const dir = join(tmpdir(), `eva-daemon-claim-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const paths = {
    pid: join(dir, "d.pid"),
    entity: join(dir, "d.entity"),
    opts: join(dir, "d.opts"),
  };
  writeFileSync(paths.pid, String(rivalPid));
  const claim = claimDaemonPidfileBoot({
    paths,
    entityId: "e",
    optsSig: "sig",
  });
  expect(claim).toEqual({ status: "rival_alive", rivalPid });
  expect(readPidFromFile(paths.pid)).toBe(rivalPid);
  rmSync(dir, { recursive: true, force: true });
});

/**
 * A pidfile that outlived a Vercel stop/resume names a pid the reboot re-issued
 * to one of the services the resume spawned. Deferring to it leaves the entity
 * with no daemon at all, which is how session 238 lost three turns.
 */
// Off Linux there is no procfs argv, so any live pid counts as a rival.
test.skipIf(process.platform !== "linux")(
  "claimDaemonPidfileBoot claims over a recycled pid",
  () => {
    const dir = join(tmpdir(), `eva-daemon-recycled-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const paths = {
      pid: join(dir, "d.pid"),
      entity: join(dir, "d.entity"),
      opts: join(dir, "d.opts"),
    };
    // The test worker: live, but its argv is not the callback runner.
    writeFileSync(paths.pid, String(process.pid));
    const claim = claimDaemonPidfileBoot({
      paths,
      entityId: "e",
      optsSig: "sig",
      currentPid: process.pid + 1,
    });
    expect(claim).toEqual({ status: "claimed" });
    expect(readPidFromFile(paths.pid)).toBe(process.pid + 1);
    rmSync(dir, { recursive: true, force: true });
  },
);

test.skipIf(process.platform !== "linux")(
  "isCallbackRunnerPid rejects a live process that is not the runner",
  () => {
    expect(pidAlive(process.pid)).toBe(true);
    expect(isCallbackRunnerPid(process.pid)).toBe(false);
    expect(isCallbackRunnerPid(2 ** 30)).toBe(false);
  },
);

test("cleanOwnedDaemonMarkers only unlinks when this pid owns the file", () => {
  const dir = join(tmpdir(), `eva-daemon-clean-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const paths = {
    pid: join(dir, "d.pid"),
    entity: join(dir, "d.entity"),
    opts: join(dir, "d.opts"),
  };
  writeFileSync(paths.pid, "1");
  writeFileSync(paths.entity, "e");
  writeFileSync(paths.opts, "sig");
  cleanOwnedDaemonMarkers({ paths, currentPid: process.pid });
  expect(existsSync(paths.pid)).toBe(true);
  writeFileSync(paths.pid, String(process.pid));
  cleanOwnedDaemonMarkers({ paths, currentPid: process.pid });
  expect(existsSync(paths.pid)).toBe(false);
  rmSync(dir, { recursive: true, force: true });
});

/**
 * A launch that races past the boot claim overwrites the pidfile; the deposed
 * daemon must exit or it double-claims turns forever, but never mid-turn.
 */
test("a deposed daemon exits only once its active work ends", () => {
  vi.useFakeTimers();
  let busy = true;
  const onDeposedIdle = vi.fn();
  const fence = startDaemonDepositionFence({
    readOwnerPid: () => process.pid + 1,
    hasActiveWork: () => busy,
    pollIntervalMs: 1000,
    log: () => {},
    logPrefix: "test daemon",
    onDeposedIdle,
  });
  try {
    vi.advanceTimersByTime(5000);
    expect(onDeposedIdle).not.toHaveBeenCalled();
    busy = false;
    vi.advanceTimersByTime(1000);
    expect(onDeposedIdle).toHaveBeenCalledTimes(1);
  } finally {
    fence.stop();
    vi.useRealTimers();
  }
});
