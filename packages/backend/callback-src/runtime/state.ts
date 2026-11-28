import type { WriteStream } from "fs";
import { parseQuestionInput } from "../parse/questionInput.js";
import type {
  JsonObject,
  JsonValue,
  ProgressStep,
  StepOutput,
  TodoItem,
  UsageLimitSnapshot,
} from "../types.js";
import { isJsonObject, trimmedString } from "../jsonGuards.js";

function nonEmptyString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function parsePriorOutput(
  value: JsonValue | undefined,
): StepOutput | undefined {
  if (!isJsonObject(value) || typeof value.text !== "string") {
    return undefined;
  }
  return {
    text: value.text,
    exitCode: typeof value.exitCode === "number" ? value.exitCode : undefined,
    truncated: value.truncated === true ? true : undefined,
  };
}

function parsePriorEdits(values: JsonValue[]): ProgressStep["edits"] {
  const edits: NonNullable<ProgressStep["edits"]> = [];
  for (const edit of values) {
    if (!isJsonObject(edit)) continue;
    if (typeof edit.oldText !== "string" || typeof edit.newText !== "string") {
      continue;
    }
    edits.push({ oldText: edit.oldText, newText: edit.newText });
  }
  return edits.length > 0 ? edits : undefined;
}

function parsePriorFiles(values: JsonValue[]): string[] | undefined {
  const files: string[] = [];
  for (const file of values) {
    const trimmed = trimmedString(file);
    if (trimmed) {
      files.push(trimmed);
    }
  }
  return files.length > 0 ? files : undefined;
}

function parsePriorTodos(values: JsonValue[]): TodoItem[] | undefined {
  const todos: TodoItem[] = [];
  for (const item of values) {
    if (!isJsonObject(item)) continue;
    if (typeof item.content !== "string" || !item.content) continue;
    const status =
      item.status === "in_progress" || item.status === "completed"
        ? item.status
        : "pending";
    todos.push({ content: item.content, status });
  }
  return todos.length > 0 ? todos : undefined;
}

function parsePriorAnswers(
  value: JsonObject,
): Record<string, string> | undefined {
  const answers: Record<string, string> = {};
  for (const [question, answer] of Object.entries(value)) {
    if (typeof answer === "string") {
      answers[question] = answer;
    }
  }
  return Object.keys(answers).length > 0 ? answers : undefined;
}

function addPriorStepPayload(step: ProgressStep, value: JsonObject): void {
  const output = parsePriorOutput(value.output);
  if (output) step.output = output;
  const edits = Array.isArray(value.edits)
    ? parsePriorEdits(value.edits)
    : undefined;
  if (edits) step.edits = edits;
  const files = Array.isArray(value.files)
    ? parsePriorFiles(value.files)
    : undefined;
  if (files) step.files = files;
  const todos = Array.isArray(value.todos)
    ? parsePriorTodos(value.todos)
    : undefined;
  if (todos) step.todos = todos;
  const questions = Array.isArray(value.questions)
    ? parseQuestionInput({ questions: value.questions })
    : undefined;
  if (questions) step.questions = questions;
  const answers = isJsonObject(value.answers)
    ? parsePriorAnswers(value.answers)
    : undefined;
  if (answers) step.answers = answers;
}

function parsePriorStep(value: JsonValue): ProgressStep | null {
  if (!isJsonObject(value)) {
    return null;
  }
  const label = value.label;
  const type = value.type;
  if (typeof label !== "string" || typeof type !== "string") {
    return null;
  }
  if (type === "thinking" || type === "reasoning" || type === "response") {
    return null;
  }
  const detail = value.detail;
  const path = value.path;
  const step: ProgressStep = {
    type,
    label,
    detail: typeof detail === "string" ? detail : undefined,
    path: typeof path === "string" ? path : undefined,
    status: "complete",
  };
  const toolUseId = trimmedString(value.toolUseId);
  if (toolUseId) step.toolUseId = toolUseId;
  const parentToolUseId = trimmedString(value.parentToolUseId);
  if (parentToolUseId) step.parentToolUseId = parentToolUseId;
  const command = nonEmptyString(value.command);
  if (command) step.command = command;
  const contentPreview = nonEmptyString(value.contentPreview);
  if (contentPreview) step.contentPreview = contentPreview;
  if (value.isError === true) {
    step.isError = true;
  }
  if (
    typeof value.durationMs === "number" &&
    Number.isFinite(value.durationMs)
  ) {
    step.durationMs = value.durationMs;
  }
  addPriorStepPayload(step, value);
  return step;
}

export const parsePriorStepForTest = parsePriorStep;

type ClaudeSessionMode = "none" | "session" | "resume";

type CallbackState = {
  accumulatedSteps: ProgressStep[];
  transientThinkingStep: ProgressStep | null;
  pendingQuestionData: string;
  lastStepType: string;
  rawOutput: string;
  rawLogStream: WriteStream | null;
  rawLogStreamFailed: boolean;
  rawLogBytesWritten: number;
  lastProcessed: number;
  lastStreamingSentAt: number;
  lastSentPayload: string;
  lastSentContent: string;
  parsedStreamEventCount: number;
  realtimeOutputBuffer: string;
  activeClaudeSessionId: string;
  activeCodexThreadId: string;
  activeOpencodeSessionId: string;
  opencodeFinalMessageId: string;
  activeCursorSessionId: string;
  resultEventSeen: boolean;
  activeClaudeSessionMode: ClaudeSessionMode;
  waitingForFirstAssistantEvent: boolean;
  claudeInitAt: number;
  activeAttemptStartedAt: number;
  firstAssistantEventAt: number;
  firstTextBlockAt: number;
  currentStreamedContent: string;
  streamedAssistantTextThisMessage: boolean;
  pendingParagraphBreak: boolean;
  fatalHeartbeatErrorMessage: string;
  consecutiveHeartbeatFailures: number;
  heartbeatFailureStreakStartedAt: number;
  inFlightToolUses: number;
  codexToolItemIds: Set<string>;
  cursorKnownToolIds: Set<string>;
  cursorTerminalToolIds: Set<string>;
  todoState: TodoItem[];
  questionAnswers: Map<string, Record<string, string>>;
  awaitingQuestionAnswer: boolean;
  usageLimitSnapshot: UsageLimitSnapshot | null;
  lastReportedUsageLimits: string;
  lastReportedUsageLimitsAt: number;
  doneFileWritten: boolean;
  flushInProgress: boolean;
  pingInProgress: boolean;
  pingStartedAt: number;
  callbackReady: boolean;
  streamingLoopsStopped: boolean;
  stderrOutput: string;
};

/** Single mutable runtime bag — ESM-safe cross-module mutations. */
export const callbackState: CallbackState = {
  accumulatedSteps: [],
  transientThinkingStep: null,
  pendingQuestionData: "",
  lastStepType: "",
  rawOutput: "",
  rawLogStream: null,
  rawLogStreamFailed: false,
  rawLogBytesWritten: 0,
  lastProcessed: 0,
  lastStreamingSentAt: Date.now(),
  lastSentPayload: "",
  lastSentContent: "",
  parsedStreamEventCount: 0,
  realtimeOutputBuffer: "",
  activeClaudeSessionId: process.env.CLAUDE_SESSION_ID || "",
  activeCodexThreadId: "",
  activeOpencodeSessionId: "",
  opencodeFinalMessageId: "",
  activeCursorSessionId: "",
  resultEventSeen: false,
  activeClaudeSessionMode: "none",
  waitingForFirstAssistantEvent: false,
  claudeInitAt: 0,
  activeAttemptStartedAt: 0,
  firstAssistantEventAt: 0,
  firstTextBlockAt: 0,
  currentStreamedContent: "",
  streamedAssistantTextThisMessage: false,
  pendingParagraphBreak: false,
  fatalHeartbeatErrorMessage: "",
  consecutiveHeartbeatFailures: 0,
  heartbeatFailureStreakStartedAt: 0,
  inFlightToolUses: 0,
  codexToolItemIds: new Set<string>(),
  cursorKnownToolIds: new Set<string>(),
  cursorTerminalToolIds: new Set<string>(),
  todoState: [],
  questionAnswers: new Map<string, Record<string, string>>(),
  awaitingQuestionAnswer: false,
  usageLimitSnapshot: null,
  lastReportedUsageLimits: "",
  lastReportedUsageLimitsAt: 0,
  doneFileWritten: false,
  flushInProgress: false,
  pingInProgress: false,
  pingStartedAt: 0,
  callbackReady: false,
  streamingLoopsStopped: false,
  stderrOutput: "",
};

try {
  const priorRaw = process.env.PRIOR_STEPS;
  if (priorRaw) {
    const prior: JsonValue = JSON.parse(priorRaw);
    if (Array.isArray(prior)) {
      for (const s of prior) {
        const step = parsePriorStep(s);
        if (step) callbackState.accumulatedSteps.push(step);
      }
    }
  }
} catch {
}

export function shiftLastProcessed(trimAmount: number): void {
  callbackState.lastProcessed = Math.max(
    0,
    callbackState.lastProcessed - trimAmount,
  );
}

export function appendRawOutputChunk(text: string): void {
  callbackState.rawOutput += text;
}

export function trimRawOutputHead(maxBytes: number): number {
  if (callbackState.rawOutput.length <= maxBytes) return 0;
  const trimAmount = callbackState.rawOutput.length - maxBytes;
  callbackState.rawOutput = callbackState.rawOutput.slice(trimAmount);
  return trimAmount;
}

export function incrementRawLogBytesWritten(n: number): void {
  callbackState.rawLogBytesWritten += n;
}

export function setRawLogStreamFailed(value: boolean): void {
  callbackState.rawLogStreamFailed = value;
}

export function assignRawLogStream(stream: WriteStream | null): void {
  callbackState.rawLogStream = stream;
}

/**
 * Clears the per-turn streaming accumulators shared by every warm daemon.
 * `rawOutput` and `lastProcessed` must reset together: a cleared buffer with a
 * live cursor makes flushStreaming's length guard permanently true, so later
 * turns persist an empty activity log.
 */
export function resetDaemonTurnStreamingState(): void {
  callbackState.accumulatedSteps.length = 0;
  callbackState.currentStreamedContent = "";
  callbackState.streamedAssistantTextThisMessage = false;
  callbackState.pendingParagraphBreak = false;
  callbackState.resultEventSeen = false;
  callbackState.rawOutput = "";
  callbackState.lastProcessed = 0;
  callbackState.realtimeOutputBuffer = "";
  callbackState.inFlightToolUses = 0;
  callbackState.pendingQuestionData = "";
  callbackState.todoState.length = 0;
  callbackState.lastStepType = "thinking";
}

export function resetAttemptState(): void {
  callbackState.transientThinkingStep = null;
  callbackState.realtimeOutputBuffer = "";
  callbackState.resultEventSeen = false;
  callbackState.waitingForFirstAssistantEvent = false;
  callbackState.claudeInitAt = 0;
  callbackState.currentStreamedContent = "";
  callbackState.firstAssistantEventAt = 0;
  callbackState.firstTextBlockAt = 0;
  callbackState.fatalHeartbeatErrorMessage = "";
  callbackState.heartbeatFailureStreakStartedAt = 0;
  callbackState.inFlightToolUses = 0;
  callbackState.codexToolItemIds.clear();
  callbackState.cursorKnownToolIds.clear();
  callbackState.cursorTerminalToolIds.clear();
  callbackState.questionAnswers.clear();
}

/** @internal test-only state resets */
export function resetStateForTests(): void {
  callbackState.accumulatedSteps.length = 0;
  callbackState.transientThinkingStep = null;
  callbackState.lastStepType = "";
  callbackState.pendingQuestionData = "";
  callbackState.fatalHeartbeatErrorMessage = "";
  callbackState.inFlightToolUses = 0;
  callbackState.firstTextBlockAt = 0;
  callbackState.waitingForFirstAssistantEvent = false;
  callbackState.claudeInitAt = 0;
  callbackState.resultEventSeen = false;
  callbackState.parsedStreamEventCount = 0;
  callbackState.cursorKnownToolIds.clear();
  callbackState.cursorTerminalToolIds.clear();
  callbackState.currentStreamedContent = "";
  callbackState.streamedAssistantTextThisMessage = false;
  callbackState.pendingParagraphBreak = false;
  callbackState.todoState.length = 0;
  callbackState.questionAnswers.clear();
  callbackState.awaitingQuestionAnswer = false;
  callbackState.usageLimitSnapshot = null;
  callbackState.lastReportedUsageLimits = "";
  callbackState.lastReportedUsageLimitsAt = 0;
}
