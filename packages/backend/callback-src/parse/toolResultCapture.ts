import { Option, Schema } from "effect";
import { NonEmptyText } from "./schemaHelpers.js";
import type {
  JsonObject,
  JsonValue,
  StepEdit,
  StepOutput,
  ToolCompleteResult,
} from "../types.js";
import { headCap, STEP_FIELD_CAPS, tailCap } from "./stepBudget.js";

/** A string with at least one non-whitespace character, kept as written. */
const NonBlankStringSchema = Schema.String.pipe(
  Schema.filter((value) => value.trim().length > 0),
);

/** A non-blank string, trimmed on the way out. */
export const TrimmedStringSchema = Schema.Trim.pipe(Schema.nonEmptyString());

/** Claude `Edit` input: the pair only counts when both sides are strings. */
const ClaudeEditPairSchema = Schema.Struct({
  old_string: Schema.String,
  new_string: Schema.String,
});

/** OpenCode part timing: a duration needs both stamps, end no earlier than start. */
const OpencodeTimeSchema = Schema.Struct({
  start: Schema.Number,
  end: Schema.Number,
}).pipe(Schema.filter((time) => time.end >= time.start));

const decodeString = Schema.decodeUnknownOption(Schema.String);
const decodeNonEmptyString = Schema.decodeUnknownOption(NonEmptyText);
const decodeNonBlankString = Schema.decodeUnknownOption(NonBlankStringSchema);
const decodeTrimmedString = Schema.decodeUnknownOption(TrimmedStringSchema);
const decodeFiniteNumber = Schema.decodeUnknownOption(Schema.Finite);
const decodeTrue = Schema.decodeUnknownOption(Schema.Literal(true));
const decodeClaudeEditPair = Schema.decodeUnknownOption(ClaudeEditPairSchema);
const decodeOpencodeTime = Schema.decodeUnknownOption(OpencodeTimeSchema);

/** First key holding a string; empty strings count. */
export function readString(
  obj: JsonObject,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = decodeString(obj[key]);
    if (Option.isSome(value)) return value.value;
  }
  return undefined;
}

/** First key holding a string with at least one character. */
export function readNonEmptyString(
  obj: JsonObject,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = decodeNonEmptyString(obj[key]);
    if (Option.isSome(value)) return value.value;
  }
  return undefined;
}

/** First key holding a non-blank string, returned as written. */
export function readNonBlankString(
  obj: JsonObject,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = decodeNonBlankString(obj[key]);
    if (Option.isSome(value)) return value.value;
  }
  return undefined;
}

/** First key holding a non-blank string, trimmed. */
export function readTrimmedString(
  obj: JsonObject,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = decodeTrimmedString(obj[key]);
    if (Option.isSome(value)) return value.value;
  }
  return undefined;
}

/** First key holding a finite number. */
function readFiniteNumber(
  obj: JsonObject,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = decodeFiniteNumber(obj[key]);
    if (Option.isSome(value)) return value.value;
  }
  return undefined;
}

/** True when one of `keys` holds the boolean `true`. */
export function readTrueFlag(
  obj: JsonObject,
  keys: readonly string[],
): boolean {
  for (const key of keys) {
    if (Option.isSome(decodeTrue(obj[key]))) return true;
  }
  return false;
}

/**
 * First key holding a plain (non-array) JSON object. Narrows the JsonValue
 * union directly so nested reads keep their JSON types.
 */
export function readObject(
  obj: JsonObject,
  keys: readonly string[],
): JsonObject | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  }
  return undefined;
}

const EDIT_OLD_KEYS = ["old_string", "oldText", "old_text"] as const;
const EDIT_NEW_KEYS = ["new_string", "newText", "new_text"] as const;
const TOOL_CALL_ID_KEYS = [
  "call_id",
  "callId",
  "tool_use_id",
  "toolUseId",
  "tool_call_id",
  "toolCallId",
  "id",
] as const;
const RESULT_TEXT_KEYS = [
  "aggregated_output",
  "aggregatedOutput",
  "output",
  "stdout",
  "stderr",
  "content",
] as const;
const NESTED_RESULT_TEXT_KEYS = [
  "output",
  "stdout",
  "stderr",
  "content",
] as const;
const RESULT_EXIT_CODE_KEYS = ["exit_code", "exitCode", "exit"] as const;
const RESULT_ERROR_FLAG_KEYS = ["is_error", "isError"] as const;
const CODEX_EXIT_CODE_KEYS = ["exit_code", "exitCode"] as const;
const OPENCODE_EXIT_CODE_KEYS = ["exit", "exit_code", "exitCode"] as const;
const CHANGE_PATH_KEYS = ["path", "file_path"] as const;

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
  const trimmed = text.trim();
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

  const pair = decodeClaudeEditPair(input);
  if (Option.isSome(pair)) {
    pushEdit(pair.value.old_string, pair.value.new_string);
  }

  const items = input.edits;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (edits.length >= STEP_FIELD_CAPS.editsMax) break;
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const oldText = readString(item, EDIT_OLD_KEYS) ?? "";
      const newText = readString(item, EDIT_NEW_KEYS) ?? "";
      if (oldText || newText) {
        pushEdit(oldText, newText);
      }
    }
  }

  return edits.length > 0 ? edits : undefined;
}

/** First non-empty string call id from a flat object. */
export function pickToolCallId(obj: JsonObject): string | undefined {
  return readTrimmedString(obj, TOOL_CALL_ID_KEYS);
}

/**
 * Defensive multi-key probe for Cursor/OpenCode/Codex result payloads.
 * Accepts nested `result` objects and flat stdout/stderr/exit fields.
 */
export function probeToolCompleteResult(
  source: JsonValue,
): ToolCompleteResult | undefined {
  const direct = decodeString(source);
  if (Option.isSome(direct)) {
    const output = buildStepOutput(direct.value);
    return output ? { output } : undefined;
  }

  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    return undefined;
  }

  const obj = source;
  const nestedResult = readObject(obj, ["result"]);

  const textCandidates: string[] = [];
  const collectText = (from: JsonObject, keys: readonly string[]): void => {
    for (const key of keys) {
      const text = decodeNonBlankString(from[key]);
      if (Option.isSome(text)) textCandidates.push(text.value);
    }
  };

  collectText(obj, RESULT_TEXT_KEYS);
  if (nestedResult) {
    collectText(nestedResult, NESTED_RESULT_TEXT_KEYS);
  }
  const stringResult = decodeString(obj.result);
  if (Option.isSome(stringResult)) {
    textCandidates.push(stringResult.value);
  }

  const exitCode =
    readFiniteNumber(obj, RESULT_EXIT_CODE_KEYS) ??
    (nestedResult
      ? readFiniteNumber(nestedResult, RESULT_EXIT_CODE_KEYS)
      : undefined);

  const combined = textCandidates.join("\n").trim();
  const output = buildStepOutput(combined, exitCode);

  const isError =
    readTrueFlag(obj, RESULT_ERROR_FLAG_KEYS) ||
    readNonBlankString(obj, ["error"]) !== undefined ||
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

  const files = obj.files;
  if (Array.isArray(files)) {
    for (const item of files) {
      const path = decodeString(item);
      if (Option.isSome(path)) add(path.value);
    }
  }

  const changes = obj.changes;
  if (Array.isArray(changes)) {
    for (const change of changes) {
      if (
        change === null ||
        typeof change !== "object" ||
        Array.isArray(change)
      ) {
        continue;
      }
      for (const key of CHANGE_PATH_KEYS) {
        const path = decodeString(change[key]);
        if (Option.isSome(path)) add(path.value);
      }
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
  const exitCode = readFiniteNumber(item, CODEX_EXIT_CODE_KEYS);
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
  const status = readString(state, ["status"]) ?? "";
  const outputText = readString(state, ["output", "error"]) ?? "";

  const metadata = readObject(state, ["metadata"]);
  const exitCode = metadata
    ? readFiniteNumber(metadata, OPENCODE_EXIT_CODE_KEYS)
    : undefined;

  const time = decodeOpencodeTime(state.time);
  const durationMs = Option.isSome(time)
    ? time.value.end - time.value.start
    : undefined;

  const isError =
    status === "error" ||
    readNonBlankString(state, ["error"]) !== undefined ||
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
