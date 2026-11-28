import { BLOCKING_QUESTIONS_ENABLED } from "../config.js";
import {
  buildClaudeStartupStep,
  syncClaudeStateToPersist,
} from "../session/claudeSession.js";
import { updateThinkingStep } from "../parse/canonical.js";
import { toolCallToStep } from "../parse/toolSteps.js";
import { buildStepOutput } from "../parse/toolResultCapture.js";
import { callbackState as S } from "../runtime/state.js";
import {
  trackClaudeToolResult,
  trackClaudeToolUse,
} from "../runtime/backgroundShells.js";
import type {
  CanonicalEvent,
  JsonObject,
  JsonValue,
  StreamLineResult,
  TodoItem,
  ToolCompleteResult,
} from "../types.js";
import {
  asJsonObject,
  elapsedAttemptMs,
  isJsonObject,
  log,
  trimmedString,
} from "../utils.js";
import type { ProviderAdapter } from "./types.js";
import {
  parseClaudeSdkTaxonomy,
  consumesClaudeSdkTaxonomyMessage,
} from "../parse/sdkTaxonomy.js";

function claudeToolCompleteResult(
  resultText: string,
  isError: boolean,
  toolUseId: string | undefined,
): ToolCompleteResult | undefined {
  let answers: Record<string, string> | undefined;
  if (toolUseId !== undefined) {
    const stored = S.questionAnswers.get(toolUseId);
    if (stored) {
      answers = stored;
      S.questionAnswers.delete(toolUseId);
    }
  }
  const output = buildStepOutput(resultText);
  if (!output && !isError && !answers) {
    return undefined;
  }
  return {
    output,
    isError: isError ? true : undefined,
    answers,
  };
}

function extractToolResultText(content: JsonValue): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === "string") {
      parts.push(item);
      continue;
    }
    if (
      isJsonObject(item) &&
      item.type === "text" &&
      typeof item.text === "string"
    ) {
      parts.push(item.text);
    }
  }
  return parts.join("");
}

function normalizeTodoStatus(value: JsonValue): TodoItem["status"] {
  return value === "in_progress" || value === "completed" ? value : "pending";
}

function reduceTodoState(name: string, input: JsonObject): TodoItem[] {
  if (name === "TodoWrite") {
    const raw = Array.isArray(input.todos) ? input.todos : [];
    S.todoState.length = 0;
    for (const item of raw) {
      if (!isJsonObject(item)) continue;
      const content = typeof item.content === "string" ? item.content : "";
      if (!content) continue;
      S.todoState.push({ content, status: normalizeTodoStatus(item.status) });
    }
  } else if (name === "TaskCreate") {
    const content =
      typeof input.subject === "string"
        ? input.subject
        : typeof input.description === "string"
          ? input.description
          : "";
    if (content) {
      S.todoState.push({ content, status: normalizeTodoStatus(input.status) });
    }
  } else if (name === "TaskUpdate") {
    const last = S.todoState[S.todoState.length - 1];
    if (last) {
      if (input.status !== undefined)
        last.status = normalizeTodoStatus(input.status);
      if (typeof input.subject === "string" && input.subject) {
        last.content = input.subject;
      }
    }
  }
  return S.todoState.map((t) => ({ ...t }));
}

function parseClaudeStreamEvent(event: JsonObject): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  const inner = isJsonObject(event.event) ? event.event : null;
  if (!inner) return events;
  if (inner.type === "message_start") {
    events.push({ kind: "mark_message_start" });
    return events;
  }
  if (inner.type === "content_block_start") {
    const contentBlock = isJsonObject(inner.content_block)
      ? inner.content_block
      : null;
    if (contentBlock && contentBlock.type === "text") {
      events.push({ kind: "mark_text_block_start" });
    }
    return events;
  }
  if (inner.type !== "content_block_delta") return events;
  const delta = isJsonObject(inner.delta) ? inner.delta : null;
  if (!delta) return events;
  if (delta.type === "text_delta" && typeof delta.text === "string") {
    if (delta.text) {
      events.push({ kind: "stream_text_delta", text: delta.text });
    }
    return events;
  }
  if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
    if (delta.thinking) {
      events.push({ kind: "update_reasoning", text: delta.thinking });
    }
  }
  return events;
}

function messageContentBlocks(event: JsonObject): JsonObject[] {
  const content = asJsonObject(event.message).content;
  if (!Array.isArray(content)) return [];
  return content.filter(isJsonObject);
}

function claudeToolResultEvent(
  toolUseId: string | undefined,
  content: JsonValue | undefined,
  isError: boolean,
): CanonicalEvent {
  const resultText =
    content !== undefined ? extractToolResultText(content) : "";
  if (toolUseId) {
    trackClaudeToolResult(toolUseId, resultText, isError);
  }
  const result = claudeToolCompleteResult(resultText, isError, toolUseId);
  return result
    ? { kind: "complete_tool", trackingId: toolUseId, result }
    : { kind: "complete_tool", trackingId: toolUseId };
}

function parseClaudeUserEvent(event: JsonObject): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  for (const block of messageContentBlocks(event)) {
    const toolUseId = trimmedString(block.tool_use_id);
    if (block.type === "tool_result" && toolUseId) {
      events.push(
        claudeToolResultEvent(
          toolUseId,
          block.content,
          block.is_error === true,
        ),
      );
    }
  }
  return events;
}

const TODO_TOOL_NAMES = new Set(["TodoWrite", "TaskCreate", "TaskUpdate"]);
const SILENT_TOOL_NAMES = new Set([
  "TodoRead",
  "TaskGet",
  "TaskList",
  "ExitPlanMode",
]);

function pushClaudeToolUseEvents(
  events: CanonicalEvent[],
  block: JsonObject,
  name: string,
  parentToolUseId: string | undefined,
): void {
  const input = asJsonObject(block.input);
  if (TODO_TOOL_NAMES.has(name)) {
    events.push({ kind: "set_todos", todos: reduceTodoState(name, input) });
    return;
  }
  if (SILENT_TOOL_NAMES.has(name)) return;
  const step = toolCallToStep(name, input);
  const trackingId = trimmedString(block.id);
  if (trackingId) {
    step.toolUseId = trackingId;
    trackClaudeToolUse(name, input, trackingId);
  }
  if (parentToolUseId) step.parentToolUseId = parentToolUseId;
  events.push(
    trackingId
      ? { kind: "push_step", step, trackingId }
      : { kind: "push_step", step },
  );
  if (
    !BLOCKING_QUESTIONS_ENABLED &&
    name === "AskUserQuestion" &&
    block.input
  ) {
    events.push({
      kind: "set_pending_question",
      data: JSON.stringify(block.input),
    });
  }
}

function pushClaudeSubagentTextEvent(
  events: CanonicalEvent[],
  block: JsonObject,
  parentToolUseId: string,
): void {
  if (block.type !== "text" || !("text" in block) || !block.text) return;
  const output = buildStepOutput(String(block.text));
  if (!output) return;
  events.push({
    kind: "push_subagent_text",
    step: {
      type: "response",
      label: "Agent message",
      status: "complete",
      parentToolUseId,
      output,
    },
  });
}

function pushClaudeAssistantBlockEvents(
  events: CanonicalEvent[],
  block: JsonObject,
  parentToolUseId: string | undefined,
): void {
  if (block.type === "tool_use" && typeof block.name === "string") {
    pushClaudeToolUseEvents(events, block, block.name, parentToolUseId);
  } else if (parentToolUseId) {
    pushClaudeSubagentTextEvent(events, block, parentToolUseId);
  } else if (
    block.type === "thinking" &&
    "thinking" in block &&
    block.thinking
  ) {
    events.push({ kind: "update_reasoning", text: String(block.thinking) });
  } else if (block.type === "text" && "text" in block && block.text) {
    if (!S.streamedAssistantTextThisMessage) {
      events.push({ kind: "append_text", text: String(block.text) });
    }
  }
}

function parseClaudeAssistantEvent(event: JsonObject): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  if (S.waitingForFirstAssistantEvent) {
    events.push({ kind: "mark_first_assistant" });
  }
  const blocks = messageContentBlocks(event);
  const parentToolUseId = trimmedString(event.parent_tool_use_id);
  for (const block of blocks) {
    pushClaudeAssistantBlockEvents(events, block, parentToolUseId);
  }
  return events;
}

export function claudeParseLine(event: JsonObject): CanonicalEvent[] {
  if (consumesClaudeSdkTaxonomyMessage(event)) {
    return parseClaudeSdkTaxonomy(event);
  }
  if (event.type === "stream_event") {
    if (trimmedString(event.parent_tool_use_id)) return [];
    return parseClaudeStreamEvent(event);
  }
  if (event.type === "tool_result") {
    return [
      claudeToolResultEvent(
        trimmedString(event.tool_use_id),
        event.content,
        event.is_error === true,
      ),
    ];
  }
  if (event.type === "user") return parseClaudeUserEvent(event);
  if (event.type !== "assistant") return [];
  return parseClaudeAssistantEvent(event);
}

function onStreamLine(parsed: JsonObject): StreamLineResult {
  if (
    parsed.type === "system" &&
    parsed.subtype === "init" &&
    typeof parsed.session_id === "string" &&
    parsed.session_id.trim()
  ) {
    S.activeClaudeSessionId = parsed.session_id.trim();
    S.claudeInitAt = Date.now();
    S.waitingForFirstAssistantEvent = true;
    log(
      "claude init event after " +
        String(elapsedAttemptMs()) +
        "ms sessionId=" +
        S.activeClaudeSessionId,
    );
    log("captured Claude session id " + S.activeClaudeSessionId);
    const startupStep = buildClaudeStartupStep();
    updateThinkingStep(startupStep.label, startupStep.detail);
    return { needsHeartbeat: true };
  }
  if (parsed.type === "assistant") {
    if (S.firstAssistantEventAt === 0) {
      S.firstAssistantEventAt = Date.now();
      log(
        "first assistant event after " +
          String(S.firstAssistantEventAt - S.activeAttemptStartedAt) +
          "ms",
      );
    }
    const message = isJsonObject(parsed.message) ? parsed.message : null;
    const contentBlocks =
      message && Array.isArray(message.content) ? message.content : [];
    for (const block of contentBlocks) {
      if (
        isJsonObject(block) &&
        block.type === "text" &&
        typeof block.text === "string"
      ) {
        if (S.firstTextBlockAt === 0) {
          S.firstTextBlockAt = Date.now();
          log(
            "first text block after " +
              String(S.firstTextBlockAt - S.activeAttemptStartedAt) +
              "ms chars=" +
              String(block.text.length),
          );
        }
        break;
      }
    }
    return {};
  }
  if (parsed.type === "result" && !S.resultEventSeen) {
    S.resultEventSeen = true;
    syncClaudeStateToPersist("result-event");
  }
  return {};
}

export const claudeAdapter: ProviderAdapter = {
  parseLine: claudeParseLine,
  onStreamLine(_line: string, parsed: JsonObject): StreamLineResult {
    return onStreamLine(parsed);
  },
};
