import { completedLabels, PROVIDER } from "../config.js";
import { claudeParseLine } from "../providers/claude.js";
import { codexParseLine } from "../providers/codex.js";
import { cursorParseLine } from "../providers/cursor.js";
import { opencodeParseLine } from "../providers/opencode.js";
import { callbackState as S } from "../runtime/state.js";
import type {
  CanonicalEvent,
  JsonObject,
  ProgressStep,
  TodoItem,
  ToolCompleteResult,
} from "../types.js";
import { tryParseJsonObject } from "../utils.js";
import { headCap, STEP_FIELD_CAPS } from "./stepBudget.js";
import {
  completeStatusOnNonStatusMessage,
  consumesClaudeSdkTaxonomyMessage,
  parseClaudeSdkTaxonomy,
} from "./sdkTaxonomy.js";

const stepStartedAt = new WeakMap<ProgressStep, number>();

function mergeToolResult(step: ProgressStep, result: ToolCompleteResult): void {
  if (result.output) {
    step.output = result.output;
  }
  if (result.isError !== undefined) {
    step.isError = result.isError;
  }
  if (result.files && result.files.length > 0) {
    step.files = result.files;
  }
  if (result.durationMs !== undefined) {
    step.durationMs = result.durationMs;
  }
  if (result.answers) {
    step.answers = result.answers;
  }
}

function markStepComplete(step: ProgressStep): void {
  step.status = "complete";
  if (completedLabels[step.label]) {
    step.label = completedLabels[step.label];
  } else if (step.label.startsWith("Using ") && step.label.endsWith("...")) {
    step.label = "Used " + step.label.slice(6, -3);
  }
  if (step.durationMs === undefined) {
    const started = stepStartedAt.get(step);
    if (started !== undefined) {
      step.durationMs = Date.now() - started;
    }
  }
}

/** Marks the last accumulated step as complete and updates its label. */
export function markLastComplete(): void {
  if (S.accumulatedSteps.length === 0) return;
  markStepComplete(S.accumulatedSteps[S.accumulatedSteps.length - 1]);
}

function completeToolStep(
  trackingId?: string,
  result?: ToolCompleteResult,
): void {
  if (trackingId) {
    for (let i = S.accumulatedSteps.length - 1; i >= 0; i--) {
      const step = S.accumulatedSteps[i];
      if (step.toolUseId === trackingId) {
        if (result) mergeToolResult(step, result);
        markStepComplete(step);
        return;
      }
    }
  }
  for (let i = S.accumulatedSteps.length - 1; i >= 0; i--) {
    const step = S.accumulatedSteps[i];
    if (step.type === "response") continue;
    if (result) mergeToolResult(step, result);
    markStepComplete(step);
    return;
  }
}

function summarizeTodos(todos: TodoItem[]): string {
  const done = todos.filter((t) => t.status === "completed").length;
  return `${done} of ${todos.length} done`;
}

function applyTodosSnapshot(todos: TodoItem[]): void {
  const existing = S.accumulatedSteps.find((step) => step.type === "todos");
  if (existing) {
    existing.todos = todos;
    existing.detail = summarizeTodos(todos);
    return;
  }
  markLastComplete();
  S.accumulatedSteps.push({
    type: "todos",
    label: "Updating tasks...",
    detail: summarizeTodos(todos),
    todos,
    status: "active",
  });
  S.lastStepType = "tool";
}

function appendReasoningDetail(step: ProgressStep, next: string): void {
  const current = step.detail ?? "";
  const merged = next.startsWith(current) ? next : current + next;
  step.detail = headCap(merged, STEP_FIELD_CAPS.reasoning).text;
}

function applyReasoningSnapshot(text: string): void {
  const next = String(text);
  if (!next) return;
  const last = S.accumulatedSteps[S.accumulatedSteps.length - 1];
  if (last && last.type === "reasoning" && last.status === "active") {
    appendReasoningDetail(last, next);
    S.lastStepType = "thinking";
    return;
  }
  markLastComplete();
  const step: ProgressStep = {
    type: "reasoning",
    label: "Thinking...",
    status: "active",
    detail: headCap(next, STEP_FIELD_CAPS.reasoning).text,
  };
  S.accumulatedSteps.push(step);
  stepStartedAt.set(step, Date.now());
  S.lastStepType = "thinking";
}

function appendResponseText(added: string): void {
  if (!added) return;
  const last = S.accumulatedSteps[S.accumulatedSteps.length - 1];
  if (last && last.type === "response" && last.status === "active") {
    last.detail = headCap(
      (last.detail ?? "") + added,
      STEP_FIELD_CAPS.response,
    ).text;
    return;
  }
  const text = added.trimStart();
  if (!text) return;
  markLastComplete();
  const step: ProgressStep = {
    type: "response",
    label: "Response",
    status: "active",
    detail: headCap(text, STEP_FIELD_CAPS.response).text,
  };
  S.accumulatedSteps.push(step);
  stepStartedAt.set(step, Date.now());
}

/**
 * Appends ONE already-finished activity row. Unlike `updateThinkingStep` this
 * survives into the message's activityLog, so a one-off event the user must be
 * able to see after the turn (a session rotation, say) leaves a trace instead of
 * a vanished thinking line. Pushed directly rather than through
 * `applyCanonicalEvents` so it never touches the in-flight tool counter.
 */
export function pushNoticeStep(label: string, detail?: string): void {
  pushProgressStep({ type: "notice", label, detail, status: "complete" });
}

/** Marks where a steered user message reached the live turn (`runtime/steering.ts`). */
export function pushSteerStep(text: string): void {
  pushProgressStep({
    type: "steer",
    label: "Steered",
    detail: text,
    status: "complete",
  });
}

/** Thinking is streamed as liveness but never persisted in the final log. */
export function updateThinkingStep(label: string, detail?: string): void {
  S.transientThinkingStep = {
    type: "thinking",
    label,
    detail,
    status: "active",
  };
  S.lastStepType = "thinking";
}

function clearThinkingStep(): void {
  S.transientThinkingStep = null;
}

function shouldRecordProgressStep(step: ProgressStep): boolean {
  return (
    step.type !== "thinking" &&
    step.type !== "reasoning" &&
    step.type !== "response"
  );
}

function pushProgressStep(step: ProgressStep): void {
  if (!shouldRecordProgressStep(step)) {
    updateThinkingStep(step.label, step.detail);
    return;
  }
  const last = S.accumulatedSteps[S.accumulatedSteps.length - 1];
  const isFirstChildUnderParent =
    step.parentToolUseId !== undefined &&
    last !== undefined &&
    last.toolUseId === step.parentToolUseId;
  if (!isFirstChildUnderParent) {
    markLastComplete();
  }
  S.accumulatedSteps.push(step);
  stepStartedAt.set(step, Date.now());
  S.lastStepType = "tool";
}

/** Provider-specific canonical events via adapter parseLine. */
export function parseToCanonical(
  event: JsonObject,
  provider: string = PROVIDER,
): CanonicalEvent[] {
  if (provider === "cursor") return cursorParseLine(event);
  if (provider === "opencode") return opencodeParseLine(event);
  if (provider === "codex") return codexParseLine(event);
  return claudeParseLine(event);
}

/** Applies canonical events to module state. */
export function applyCanonicalEvents(events: CanonicalEvent[]): boolean {
  if (events.length === 0) return false;
  for (const ev of events) {
    switch (ev.kind) {
      case "update_thinking":
        updateThinkingStep(ev.label, ev.detail);
        break;
      case "push_step":
        clearThinkingStep();
        pushProgressStep(ev.step);
        if (shouldRecordProgressStep(ev.step)) {
          if (ev.trackingId) S.codexToolItemIds.add(ev.trackingId);
          S.inFlightToolUses++;
        }
        break;
      case "complete_tool":
        clearThinkingStep();
        completeToolStep(ev.trackingId, ev.result);
        if (ev.trackingId !== undefined) {
          S.codexToolItemIds.delete(ev.trackingId);
        }
        if (S.inFlightToolUses > 0) {
          S.inFlightToolUses--;
        }
        break;
      case "mark_last_complete":
        clearThinkingStep();
        markLastComplete();
        break;
      case "append_text":
        clearThinkingStep();
        appendStreamedContent(ev.text, true);
        break;
      case "push_subagent_text":
        clearThinkingStep();
        S.accumulatedSteps.push(ev.step);
        break;
      case "stream_text_delta":
        clearThinkingStep();
        appendStreamedContent(ev.text, S.pendingParagraphBreak);
        S.pendingParagraphBreak = false;
        S.streamedAssistantTextThisMessage = true;
        break;
      case "mark_message_start":
        S.streamedAssistantTextThisMessage = false;
        S.pendingParagraphBreak = true;
        break;
      case "mark_text_block_start":
        S.pendingParagraphBreak = true;
        break;
      case "update_reasoning":
        clearThinkingStep();
        applyReasoningSnapshot(ev.text);
        break;
      case "set_pending_question":
        clearThinkingStep();
        S.pendingQuestionData = ev.data;
        break;
      case "set_todos":
        clearThinkingStep();
        applyTodosSnapshot(ev.todos);
        break;
      case "set_codex_thread":
        S.activeCodexThreadId = ev.threadId;
        break;
      case "mark_first_assistant":
        clearThinkingStep();
        S.waitingForFirstAssistantEvent = false;
        break;
    }
  }
  return true;
}

/** Parses a single JSON stream event line and updates accumulated steps. */
export function parseStreamEvent(line: string): boolean {
  const event = tryParseJsonObject(line);
  if (!event) return false;
  try {
    completeStatusOnNonStatusMessage(event);
    if (consumesClaudeSdkTaxonomyMessage(event)) {
      applyCanonicalEvents(parseClaudeSdkTaxonomy(event));
      return true;
    }
    return applyCanonicalEvents(parseToCanonical(event, PROVIDER));
  } catch {
    return false;
  }
}

function appendStreamedContent(text: string, isBlockBoundary = false): void {
  const before = S.currentStreamedContent;
  writeStreamedContent(text, isBlockBoundary);
  appendResponseText(S.currentStreamedContent.slice(before.length));
}

function writeStreamedContent(text: string, isBlockBoundary: boolean): void {
  const nextText = String(text);
  if (!nextText) {
    return;
  }
  if (nextText.startsWith(S.currentStreamedContent)) {
    S.currentStreamedContent = nextText;
    return;
  }
  if (
    isBlockBoundary &&
    S.currentStreamedContent.length > 0 &&
    !S.currentStreamedContent.endsWith("\n") &&
    !nextText.startsWith("\n")
  ) {
    S.currentStreamedContent += "\n\n";
  }
  S.currentStreamedContent += nextText;
}
