import type {
  JsonObject,
  JsonValue,
  StepEdit,
  StepOutput,
  ToolCompleteResult,
} from "../types.js";
import { headCap, STEP_FIELD_CAPS, tailCap } from "./stepBudget.js";
import { redactSecrets } from "../redactSecrets.js";

/** Caps a command string for ProgressStep.command. */
export function capCommand(command: string): string {
  return headCap(command, STEP_FIELD_CAPS.command).text;
}

/** Caps write content for ProgressStep.contentPreview. */
export function capContentPreview(content: string): string {
  return headCap(content, STEP_FIELD_CAPS.contentPreview).text;
}

/** Builds a capped output payload (tail-biased). */
export function buildStepOutput(
  text: string,
  exitCode?: number,
): StepOutput | undefined {
  const trimmed = redactSecrets(text).trim();
  if (!trimmed && exitCode === undefined) {
    return undefined;
  }
  const capped = tailCap(trimmed, STEP_FIELD_CAPS.output);
  return {
    text: capped.text,
    exitCode,
    truncated: capped.truncated ? true : undefined,
  };
}

/** Extracts Edit old/new strings (and defensive edits[] arrays) with caps. */
export function extractClaudeEdits(input: JsonObject): StepEdit[] | undefined {
  const edits: StepEdit[] = [];

  const pushEdit = (oldText: string, newText: string): void => {
    if (edits.length >= STEP_FIELD_CAPS.editsMax) return;
    edits.push({
      oldText: headCap(oldText, STEP_FIELD_CAPS.editSide).text,
      newText: headCap(newText, STEP_FIELD_CAPS.editSide).text,
    });
  };

  if (
    typeof input.old_string === "string" &&
    typeof input.new_string === "string"
  ) {
    pushEdit(input.old_string, input.new_string);
  }

  if (Array.isArray(input.edits)) {
    for (const item of input.edits) {
      if (edits.length >= STEP_FIELD_CAPS.editsMax) break;
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const oldText =
        typeof item.old_string === "string"
          ? item.old_string
          : typeof item.oldText === "string"
            ? item.oldText
            : typeof item.old_text === "string"
              ? item.old_text
              : "";
      const newText =
        typeof item.new_string === "string"
          ? item.new_string
          : typeof item.newText === "string"
            ? item.newText
            : typeof item.new_text === "string"
              ? item.new_text
              : "";
      if (oldText || newText) {
        pushEdit(oldText, newText);
      }
    }
  }

  return edits.length > 0 ? edits : undefined;
}

function readStringField(obj: JsonObject, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

function readNumberField(obj: JsonObject, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

/** First non-empty string call id from a flat object. */
export function pickToolCallId(obj: JsonObject): string | undefined {
  const id = readStringField(obj, [
    "call_id",
    "callId",
    "tool_use_id",
    "toolUseId",
    "tool_call_id",
    "toolCallId",
    "id",
  ]);
  return id.trim() ? id.trim() : undefined;
}

/**
 * Defensive multi-key probe for Cursor/OpenCode/Codex result payloads.
 * Accepts nested `result` objects and flat stdout/stderr/exit fields.
 */
export function probeToolCompleteResult(
  source: JsonValue,
): ToolCompleteResult | undefined {
  if (source === null || source === undefined) {
    return undefined;
  }

  if (typeof source === "string") {
    const output = buildStepOutput(source);
    return output ? { output } : undefined;
  }

  if (typeof source !== "object" || Array.isArray(source)) {
    return undefined;
  }

  const obj = source;
  const nestedResult =
    obj.result && typeof obj.result === "object" && !Array.isArray(obj.result)
      ? obj.result
      : null;

  const textCandidates: string[] = [];
  const pushText = (value: JsonValue | undefined): void => {
    if (typeof value === "string" && value.trim()) {
      textCandidates.push(value);
    }
  };

  pushText(obj.aggregated_output);
  pushText(obj.aggregatedOutput);
  pushText(obj.output);
  pushText(obj.stdout);
  pushText(obj.stderr);
  pushText(obj.content);
  if (nestedResult) {
    pushText(nestedResult.output);
    pushText(nestedResult.stdout);
    pushText(nestedResult.stderr);
    pushText(nestedResult.content);
  }
  if (typeof obj.result === "string") {
    textCandidates.push(obj.result);
  }

  const exitCode =
    readNumberField(obj, ["exit_code", "exitCode", "exit"]) ??
    (nestedResult
      ? readNumberField(nestedResult, ["exit_code", "exitCode", "exit"])
      : undefined);

  const combined = textCandidates.join("\n").trim();
  const output = buildStepOutput(combined, exitCode);

  const isError =
    obj.is_error === true ||
    obj.isError === true ||
    (typeof obj.error === "string" && obj.error.trim().length > 0) ||
    (exitCode !== undefined && exitCode !== 0);

  const files = extractFilePaths(obj);

  if (!output && !isError && files.length === 0) {
    return undefined;
  }

  return {
    output,
    isError: isError ? true : undefined,
    files: files.length > 0 ? files : undefined,
  };
}

/** Pulls file paths from codex-style `changes[]` or flat `files` arrays. */
export function extractFilePaths(obj: JsonObject): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  const add = (path: string): void => {
    const trimmed = path.trim();
    if (!trimmed || seen.has(trimmed)) return;
    if (paths.length >= STEP_FIELD_CAPS.filesMax) return;
    seen.add(trimmed);
    paths.push(trimmed);
  };

  if (Array.isArray(obj.files)) {
    for (const item of obj.files) {
      if (typeof item === "string") add(item);
    }
  }

  if (Array.isArray(obj.changes)) {
    for (const change of obj.changes) {
      if (!change || typeof change !== "object" || Array.isArray(change)) {
        continue;
      }
      if (typeof change.path === "string") add(change.path);
      if (typeof change.file_path === "string") add(change.file_path);
    }
  }

  return paths;
}

/** Codex item.completed / item.failed result probe. */
export function probeCodexItemResult(
  item: JsonObject,
  failed: boolean,
): ToolCompleteResult | undefined {
  const probed = probeToolCompleteResult(item);
  const files = extractFilePaths(item);
  const exitCode = readNumberField(item, ["exit_code", "exitCode"]);
  const isError =
    failed ||
    (exitCode !== undefined && exitCode !== 0) ||
    probed?.isError === true;

  if (!probed && files.length === 0 && !isError) {
    return undefined;
  }

  return {
    output: probed?.output,
    isError: isError ? true : undefined,
    files: files.length > 0 ? files : probed?.files,
  };
}

/** OpenCode tool_use part state → complete result (+ optional duration). */
export function probeOpencodeStateResult(
  state: JsonObject,
): ToolCompleteResult | undefined {
  const status = typeof state.status === "string" ? state.status : "";
  const outputText =
    typeof state.output === "string"
      ? state.output
      : typeof state.error === "string"
        ? state.error
        : "";

  const metadata =
    state.metadata &&
    typeof state.metadata === "object" &&
    !Array.isArray(state.metadata)
      ? state.metadata
      : null;
  const exitCode = metadata
    ? readNumberField(metadata, ["exit", "exit_code", "exitCode"])
    : undefined;

  const time =
    state.time && typeof state.time === "object" && !Array.isArray(state.time)
      ? state.time
      : null;
  let durationMs: number | undefined;
  if (
    time &&
    typeof time.start === "number" &&
    typeof time.end === "number" &&
    time.end >= time.start
  ) {
    durationMs = time.end - time.start;
  }

  const isError =
    status === "error" ||
    (typeof state.error === "string" && state.error.trim().length > 0) ||
    (exitCode !== undefined && exitCode !== 0);

  const output = buildStepOutput(outputText, exitCode);
  if (!output && !isError && durationMs === undefined) {
    return undefined;
  }

  return {
    output,
    isError: isError ? true : undefined,
    durationMs,
  };
}
