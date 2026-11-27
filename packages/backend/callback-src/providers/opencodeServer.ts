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
import { log, tryParseJsonObject } from "../utils.js";
import { pidAlive, sleep, writeOomScoreAdj } from "../runtime/daemonProcess.js";

const SERVER_STATE_FILE = OPENCODE_RUNTIME_HOME_DIR + "/server.json";
const SERVER_LOCK_DIR = OPENCODE_RUNTIME_HOME_DIR + "/server.lock";
const SERVER_LOG_FILE = OPENCODE_RUNTIME_HOME_DIR + "/server.log";

const HEALTH_PROBE_TIMEOUT_MS = 3_000;
const STARTUP_PROBE_TIMEOUT_MS = 250;
const STARTUP_TIMEOUT_MS = 60_000;
const HEALTH_POLL_INTERVAL_MS = 50;
const LOCK_STALE_MS = 90_000;
const LOG_TAIL_BYTES = 4_000;

const opencodeServerBaseUrl =
  "http://127.0.0.1:" + String(OPENCODE_SERVER_PORT);


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

async function probeHealth(
  timeoutMs: number = HEALTH_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  try {
    const response = await fetch(opencodeServerBaseUrl + "/config", {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function readRecordedPid(): number {
  try {
    const parsed = tryParseJsonObject(readFileSync(SERVER_STATE_FILE, "utf8"));
    if (!parsed) return 0;
    return typeof parsed.pid === "number" && parsed.pid > 0 ? parsed.pid : 0;
  } catch {
    return 0;
  }
}

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
        cwd: AGENT_CWD,
        env: { ...process.env },
        detached: true,
        stdio: ["ignore", logFd, logFd],
      },
    );
    child.unref();
    const pid = child.pid ?? 0;
    writeOomScoreAdj(pid, "300");
    writeFileSync(
      SERVER_STATE_FILE,
      JSON.stringify({ pid, port: OPENCODE_SERVER_PORT }),
    );
    return pid;
  } finally {
    closeSync(logFd);
  }
}

async function waitForHealth(pid: number): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await probeHealth(STARTUP_PROBE_TIMEOUT_MS)) return;
    if (pid && !pidAlive(pid)) {
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
    }
    return false;
  }
}

function releaseStartupLock(): void {
  try {
    rmSync(SERVER_LOCK_DIR, { recursive: true, force: true });
  } catch {
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
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(HEALTH_POLL_INTERVAL_MS);
      if (await probeHealth(STARTUP_PROBE_TIMEOUT_MS)) {
        return opencodeServerBaseUrl;
      }
      if (!existsSync(SERVER_LOCK_DIR)) break;
    }
    if (await probeHealth()) return opencodeServerBaseUrl;
    releaseStartupLock();
    if (!acquireStartupLock()) {
      throw new Error(
        "could not acquire the opencode server startup lock. Server log tail:\n" +
          readOpencodeServerLogTail(),
      );
    }
  }

  try {
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
