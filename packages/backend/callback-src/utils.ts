import { spawnSync } from "child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import {
  CLAUDE_BASE_CONFIG_DIR,
  CLAUDE_LOCAL_PROJECT_DIR,
  CLAUDE_RUNTIME_CONFIG_DIR,
  CLAUDE_SYNC_PER_FILE_TIMEOUT_SECONDS,
  CLAUDE_SYNC_TIMEOUT_MS,
  WORK_DIR,
} from "./config.js";
import { callbackState as S } from "./runtime/state.js";
import type { JsonValue } from "./types.js";

/** Narrow JSON.parse / Response.json() payloads into JsonValue (null if invalid). */
function narrowJsonValue(
  value: string | number | boolean | null | object,
): JsonValue | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const items: JsonValue[] = [];
    for (const item of value) {
      if (
        typeof item !== "object" &&
        typeof item !== "string" &&
        typeof item !== "number" &&
        typeof item !== "boolean" &&
        item !== null
      ) {
        return null;
      }
      const narrowed = narrowJsonValue(item);
      if (narrowed === null && item !== null) return null;
      items.push(narrowed);
    }
    return items;
  }
  const obj: { [key: string]: JsonValue } = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry !== "object" &&
      typeof entry !== "string" &&
      typeof entry !== "number" &&
      typeof entry !== "boolean" &&
      entry !== null
    ) {
      return null;
    }
    const narrowed = narrowJsonValue(entry);
    if (narrowed === null && entry !== null) return null;
    obj[key] = narrowed;
  }
  return obj;
}

/** Logs a timestamped debug message to stderr and the debug log file. */
export function log(msg: string): void {
  const line = "[callback " + new Date().toISOString() + "] " + msg + "\n";
  console.error(line.trim());
  try {
    writeFileSync("/tmp/callback-debug.log", line, { flag: "a" });
  } catch {
    /* ignore log write failures */
  }
}

/** Attempts to parse a JSON string, returning null on failure. */
export function tryParseJson(text: string): JsonValue | null {
  try {
    const parsed = JSON.parse(text);
    if (
      parsed === null ||
      typeof parsed === "string" ||
      typeof parsed === "number" ||
      typeof parsed === "boolean" ||
      typeof parsed === "object"
    ) {
      return narrowJsonValue(parsed);
    }
    return null;
  } catch {
    return null;
  }
}

/** Narrow a fetch Response.json() body; rejects non-JSON types without assertions. */
export async function readResponseJson(
  res: Response,
): Promise<JsonValue | null> {
  const parsed = await res.json();
  if (
    parsed === null ||
    typeof parsed === "string" ||
    typeof parsed === "number" ||
    typeof parsed === "boolean" ||
    typeof parsed === "object"
  ) {
    return narrowJsonValue(parsed);
  }
  return null;
}

/** Shortens a file path to show only the last 3 segments for display. */
export function shortenPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  if (parts.length <= 4) return parts.join("/");
  return ".../" + parts.slice(-3).join("/");
}

/** Copies a file from source to target via bash if the source exists. */
export function copyFileIfPresent(
  sourcePath: string,
  targetPath: string,
  label: string,
): void {
  const copyScript =
    "if [ -f " +
    JSON.stringify(sourcePath) +
    " ]; then timeout " +
    String(CLAUDE_SYNC_PER_FILE_TIMEOUT_SECONDS) +
    " cp -f " +
    JSON.stringify(sourcePath) +
    " " +
    JSON.stringify(targetPath) +
    " || true; fi";
  runTimedBashSync(copyScript, label);
}

/** Decodes a base64-encoded string to UTF-8. */
export function decodeBase64(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}

/** Runs a bash script synchronously with a timeout, returning success status. */
export function runTimedBashSync(script: string, label: string): boolean {
  const result = spawnSync("bash", ["-lc", script], {
    encoding: "utf8",
    env: { ...process.env },
    timeout: CLAUDE_SYNC_TIMEOUT_MS,
  });
  const timedOut = result.signal === "SIGTERM" || result.signal === "SIGKILL";
  if (result.error || timedOut || result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    log(
      label +
        " failed (status=" +
        String(result.status) +
        ", signal=" +
        String(result.signal || "none") +
        "): " +
        (result.error
          ? String(result.error)
          : stderr || stdout || "unknown error"),
    );
    return false;
  }
  return true;
}

/**
 * Returns the current git HEAD sha in `dir` (defaults to the primary
 * workspace), or empty when unavailable — missing directory, not a git repo,
 * or no commits yet all fail the same way, so callers skip on empty rather
 * than distinguishing why.
 */
export function readGitHeadSha(dir: string = WORK_DIR): string {
  const result = spawnSync("git", ["-C", dir, "rev-parse", "HEAD"], {
    encoding: "utf8",
    timeout: CLAUDE_SYNC_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    return "";
  }
  return (result.stdout || "").trim();
}

/** True when the workspace has at least one commit after baselineHead. */
export function hasNewTaskCommitSince(baselineHead: string): boolean {
  if (!baselineHead) {
    return false;
  }
  const currentHead = readGitHeadSha();
  if (!currentHead || currentHead === baselineHead) {
    return false;
  }
  const countResult = spawnSync(
    "git",
    ["-C", WORK_DIR, "rev-list", "--count", baselineHead + ".." + currentHead],
    { encoding: "utf8", timeout: CLAUDE_SYNC_TIMEOUT_MS },
  );
  if (countResult.status !== 0) {
    return true;
  }
  const count = Number((countResult.stdout || "").trim());
  return Number.isFinite(count) && count > 0;
}

/** Copies base Claude config files to the runtime config directory. */
export function copyBaseClaudeConfig(): void {
  const startedAt = Date.now();
  if (!existsSync(CLAUDE_BASE_CONFIG_DIR)) {
    log("copyBaseClaudeConfig skipped: base config dir missing");
    return;
  }
  mkdirSync(CLAUDE_RUNTIME_CONFIG_DIR, { recursive: true });
  for (const entry of readdirSync(CLAUDE_BASE_CONFIG_DIR, {
    withFileTypes: true,
  })) {
    if (entry.name === "projects") {
      continue;
    }
    const sourcePath = CLAUDE_BASE_CONFIG_DIR + "/" + entry.name;
    const targetPath = CLAUDE_RUNTIME_CONFIG_DIR + "/" + entry.name;
    try {
      cpSync(sourcePath, targetPath, { force: true, recursive: true });
    } catch (error) {
      log("copyBaseClaudeConfig skipped " + entry.name + ": " + String(error));
    }
  }
  log(
    "copyBaseClaudeConfig finished in " + String(Date.now() - startedAt) + "ms",
  );
}

/** Logs byte size and line count of a Claude transcript file for diagnostics. */
export function logTranscriptStats(sessionId: string, label: string): void {
  if (!sessionId) {
    log(label + ": no session id");
    return;
  }
  const transcriptPath = buildClaudeTranscriptPath(
    CLAUDE_LOCAL_PROJECT_DIR,
    sessionId,
  );
  if (!existsSync(transcriptPath)) {
    log(label + ": transcript missing (" + transcriptPath + ")");
    return;
  }
  try {
    const content = readFileSync(transcriptPath, "utf8");
    const lineCount = content.length === 0 ? 0 : content.split("\n").length;
    const byteSize = statSync(transcriptPath).size;
    log(
      label +
        ": sessionId=" +
        sessionId +
        " bytes=" +
        String(byteSize) +
        " lines=" +
        String(lineCount),
    );
  } catch (error) {
    log(label + ": failed to inspect transcript: " + String(error));
  }
}

/** Builds the file path for a Claude session transcript JSONL file. */
export function buildClaudeTranscriptPath(
  projectDir: string,
  sessionId: string,
): string {
  return projectDir + "/" + sessionId + ".jsonl";
}

/** Milliseconds elapsed since the current attempt started; 0 before it begins. */
export function attemptElapsedMs(): number {
  return S.activeAttemptStartedAt > 0
    ? Date.now() - S.activeAttemptStartedAt
    : 0;
}

/** Returns milliseconds elapsed since the current attempt started. */
export function elapsedAttemptMs(): number {
  return attemptElapsedMs();
}
