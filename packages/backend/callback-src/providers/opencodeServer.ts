import { spawn } from "child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import {
  AGENT_CWD,
  OPENCODE_RUNTIME_HOME_DIR,
  OPENCODE_SERVER_PORT,
  opencodeCommand,
} from "../config.js";
import { log, tryParseJson } from "../utils.js";

/**
 * Eva-managed `opencode serve` process — one healthy HTTP server per sandbox,
 * shared by every turn.
 *
 * The opencode SDK is a typed HTTP client, so a server has to exist before a
 * turn can run. `createOpencode()` would spawn one per client, but it ties the
 * process lifetime to the caller: our callback exits after each turn, which
 * would mean a cold server start (~2s) on every single turn. Instead the server
 * is spawned detached, recorded in a pidfile, health-probed for reuse, and
 * restarted whenever the probe fails (crash, sandbox resume, OOM kill).
 *
 * NOTE: the server inherits the callback's env verbatim, HOME included. Do NOT
 * point HOME at OPENCODE_RUNTIME_HOME_DIR — that dir only holds Eva's own
 * session-state file, while opencode reads credentials from
 * /home/eva/.local/share/opencode/auth.json (written by
 * hydratePersistedOpencodeState before we get here).
 */

const SERVER_STATE_FILE = OPENCODE_RUNTIME_HOME_DIR + "/server.json";
const SERVER_LOCK_DIR = OPENCODE_RUNTIME_HOME_DIR + "/server.lock";
const SERVER_LOG_FILE = OPENCODE_RUNTIME_HOME_DIR + "/server.log";

const HEALTH_PROBE_TIMEOUT_MS = 3_000;
const STARTUP_TIMEOUT_MS = 60_000;
const HEALTH_POLL_INTERVAL_MS = 250;
/** A lock older than this belongs to a callback that died mid-start. */
const LOCK_STALE_MS = 90_000;
/** Cap on the server log tail surfaced in error messages. */
const LOG_TAIL_BYTES = 4_000;

const opencodeServerBaseUrl =
  "http://127.0.0.1:" + String(OPENCODE_SERVER_PORT);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Tail of the detached server's stdout+stderr, for failure diagnostics. */
export function readOpencodeServerLogTail(
  maxBytes: number = LOG_TAIL_BYTES,
): string {
  try {
    const contents = readFileSync(SERVER_LOG_FILE, "utf8");
    return contents.length > maxBytes ? contents.slice(-maxBytes) : contents;
  } catch {
    return "";
  }
}

/**
 * `GET /config` is the cheapest authenticated-by-nothing route the server
 * exposes; a 2xx means the HTTP layer and the config loader are both up.
 */
async function probeHealth(): Promise<boolean> {
  try {
    const response = await fetch(opencodeServerBaseUrl + "/config", {
      signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function readRecordedPid(): number {
  try {
    const parsed = tryParseJson(readFileSync(SERVER_STATE_FILE, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return 0;
    }
    return typeof parsed.pid === "number" && parsed.pid > 0 ? parsed.pid : 0;
  } catch {
    return 0;
  }
}

/**
 * Kills the recorded server only when the pid still belongs to an opencode
 * process — pids are recycled, and a stale pidfile must never take out an
 * unrelated sandbox process (the repo's dev server, a user command).
 */
function killRecordedServer(): void {
  const pid = readRecordedPid();
  if (!pid) return;
  let cmdline = "";
  try {
    cmdline = readFileSync("/proc/" + String(pid) + "/cmdline", "utf8");
  } catch {
    return;
  }
  if (!cmdline.includes("opencode")) return;
  try {
    process.kill(pid, "SIGKILL");
    log("opencode server pid=" + String(pid) + " was unhealthy — killed");
  } catch {
    /* already gone */
  }
}

function spawnServer(): number {
  const logFd = openSync(SERVER_LOG_FILE, "a");
  try {
    const child = spawn(
      opencodeCommand,
      [
        "serve",
        "--hostname=127.0.0.1",
        "--port=" + String(OPENCODE_SERVER_PORT),
      ],
      {
        // Manual smoke test (tests/linkedReposHarness.manual.md) decides
        // whether Opencode can edit outside cwd in a multi-repo session; if
        // not, set EVA_LINKED_REPOS_CWD_ROOT=1 to root cwd at the workspace
        // instead — no rebuild needed.
        cwd: AGENT_CWD,
        env: { ...process.env },
        // Detached: the server must outlive this turn's callback process so the
        // next turn reuses it instead of paying a cold start.
        detached: true,
        stdio: ["ignore", logFd, logFd],
      },
    );
    child.unref();
    const pid = child.pid ?? 0;
    // Make the kernel OOM killer prefer the agent subtree (server -> tool
    // processes like tsc, which all inherit this score) over the callback,
    // which the launcher deliberately protects as the heartbeat and failure
    // reporter. Without this the server would inherit that protection and a
    // memory-hungry tool could get the reporter killed instead of itself.
    // Raising a score on our own child is always permitted.
    if (pid) {
      try {
        writeFileSync("/proc/" + String(pid) + "/oom_score_adj", "300");
      } catch {
        /* non-Linux or already exited — ignore */
      }
    }
    writeFileSync(
      SERVER_STATE_FILE,
      JSON.stringify({ pid, port: OPENCODE_SERVER_PORT }),
    );
    return pid;
  } finally {
    closeSync(logFd);
  }
}

function processAlive(pid: number): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForHealth(pid: number): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await probeHealth()) return;
    if (pid && !processAlive(pid)) {
      throw new Error(
        "opencode serve exited during startup. Server log tail:\n" +
          readOpencodeServerLogTail(),
      );
    }
    await sleep(HEALTH_POLL_INTERVAL_MS);
  }
  throw new Error(
    "opencode serve did not become healthy on " +
      opencodeServerBaseUrl +
      " within " +
      String(STARTUP_TIMEOUT_MS) +
      "ms. Server log tail:\n" +
      readOpencodeServerLogTail(),
  );
}

/**
 * mkdir is the atomic primitive available on every filesystem, so the lock is a
 * directory rather than a file. A concurrent turn (chat + task on one sandbox)
 * that loses the race waits on the health probe instead of racing a second
 * server onto the same port.
 */
function acquireStartupLock(): boolean {
  try {
    mkdirSync(SERVER_LOCK_DIR);
    return true;
  } catch {
    try {
      const ageMs = Date.now() - statSync(SERVER_LOCK_DIR).mtimeMs;
      if (ageMs > LOCK_STALE_MS) {
        rmSync(SERVER_LOCK_DIR, { recursive: true, force: true });
        mkdirSync(SERVER_LOCK_DIR);
        log("opencode server startup lock was stale — reclaimed");
        return true;
      }
    } catch {
      /* lost the reclaim race — fall through and wait */
    }
    return false;
  }
}

function releaseStartupLock(): void {
  try {
    rmSync(SERVER_LOCK_DIR, { recursive: true, force: true });
  } catch {
    /* already released */
  }
}

/**
 * Returns the base URL of a healthy `opencode serve`, starting one if needed.
 * Safe to call on every turn: the happy path is a single sub-millisecond
 * loopback request.
 */
export async function ensureOpencodeServer(): Promise<string> {
  mkdirSync(OPENCODE_RUNTIME_HOME_DIR, { recursive: true });
  if (await probeHealth()) return opencodeServerBaseUrl;

  if (!acquireStartupLock()) {
    // Another callback is starting the server; its health is our health.
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(HEALTH_POLL_INTERVAL_MS);
      if (await probeHealth()) return opencodeServerBaseUrl;
      if (!existsSync(SERVER_LOCK_DIR)) break;
    }
    if (await probeHealth()) return opencodeServerBaseUrl;
    // The lock holder gave up. Fall through and start one ourselves.
    releaseStartupLock();
    if (!acquireStartupLock()) {
      throw new Error(
        "could not acquire the opencode server startup lock. Server log tail:\n" +
          readOpencodeServerLogTail(),
      );
    }
  }

  try {
    // Re-probe under the lock: the previous holder may have just succeeded.
    if (await probeHealth()) return opencodeServerBaseUrl;
    killRecordedServer();
    const startedAt = Date.now();
    const pid = spawnServer();
    await waitForHealth(pid);
    log(
      "opencode serve ready on " +
        opencodeServerBaseUrl +
        " (pid=" +
        String(pid) +
        ", " +
        String(Date.now() - startedAt) +
        "ms)",
    );
    return opencodeServerBaseUrl;
  } finally {
    releaseStartupLock();
  }
}
