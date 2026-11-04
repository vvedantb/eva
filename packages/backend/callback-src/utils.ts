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
  PROMPT_FILE,
  SYSTEM_PROMPT,
  WORK_DIR,
} from "./config.js";
import { git } from "./runtime/gitExec.js";
import { callbackState as S } from "./runtime/state.js";
import type { JsonObject, JsonValue } from "./types.js";

/** Read the turn prompt that launch.ts uploads to PROMPT_FILE. */
export function readTurnPrompt(): string {
  return readFileSync(PROMPT_FILE, "utf8");
}

/** Prepend SYSTEM_PROMPT for providers that have no system-prompt option. */
export function withSystemPrompt(prompt: string): string {
  return SYSTEM_PROMPT ? SYSTEM_PROMPT + "\n\n" + prompt : prompt;
}

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

/** Message text of an Error, or `String(value)` for anything else. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True when the JSON value is a plain object (not null, not an array). */
export function isJsonObject(
  value: JsonValue | null | undefined,
): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Coerces a JSON value to an object; non-objects become `{}`. */
export function asJsonObject(value: JsonValue | undefined): JsonObject {
  return isJsonObject(value) ? value : {};
}

/** Trimmed string when the value is a string with non-blank content. */
export function readTrimmedString(
  value: JsonValue | undefined,
): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Raw (untrimmed) value of the first key whose value is a string with
 * non-blank content; "" when none match.
 */
export function readStringField(
  obj: JsonObject,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

/**
 * Convex `/api/mutation` wraps returns in `{ status, value }`. Readers accept
 * either that envelope or a bare object so older/unwrapped fixtures still work.
 */
export function unwrapConvexMutationPayload(
  result: JsonValue,
): JsonObject | null {
  if (!isJsonObject(result)) return null;
  const inner = result.value;
  return isJsonObject(inner) ? inner : result;
}

/** Parses JSON text and keeps it only when it is a plain object. */
export function tryParseJsonObject(text: string): JsonObject | null {
  const parsed = tryParseJson(text);
  return isJsonObject(parsed) ? parsed : null;
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
  const result = git(["rev-parse", "HEAD"], {
    cwd: dir,
    timeoutMs: CLAUDE_SYNC_TIMEOUT_MS,
  });
  return result.ok ? result.stdout : "";
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
  const countResult = git(
    ["rev-list", "--count", baselineHead + ".." + currentHead],
    { timeoutMs: CLAUDE_SYNC_TIMEOUT_MS },
  );
  if (!countResult.ok) {
    return true;
  }
  const count = Number(countResult.stdout);
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
