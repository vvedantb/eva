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
import { elapsedAttemptMs, log } from "../utils.js";
import type { ProviderAdapter } from "./types.js";
import {
  parseClaudeSdkTaxonomy,
  consumesClaudeSdkTaxonomyMessage,
} from "../parse/sdkTaxonomy.js";

function claudeToolCompleteResult(
  resultText: string,
  isError: boolean,
): ToolCompleteResult | undefined {
  const output = buildStepOutput(resultText);
  if (!output && !isError) {
    return undefined;
  }
  return {
    output,
    isError: isError ? true : undefined,
  };
}

/** Pull plain text out of a tool_result content field (string or text blocks). */
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
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      item.type === "text" &&
      typeof item.text === "string"
    ) {
      parts.push(item.text);
    }
  }
  return parts.join("");
}

/** Coerces a raw todo status field to the checklist's fixed set. */
function normalizeTodoStatus(value: JsonValue): TodoItem["status"] {
  return value === "in_progress" || value === "completed" ? value : "pending";
}

/**
 * Folds one todo tool call into `S.todoState` and returns the current snapshot.
 * `TodoWrite` (the tool the sandbox CLI emits) sends the full list every call,
 * so it is a straight replace. `TaskCreate`/`TaskUpdate` (newer CLI Task tools)
 * are handled best-effort — create appends, update patches the last item — so a
 * CLI upgrade degrades gracefully rather than losing the checklist entirely.
 */
function reduceTodoState(name: string, input: JsonObject): TodoItem[] {
  if (name === "TodoWrite") {
    const raw = Array.isArray(input.todos) ? input.todos : [];
    S.todoState.length = 0;
    for (const item of raw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
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

/**
 * Handles Anthropic partial (`stream_event`) messages emitted when the SDK is
 * run with `includePartialMessages: true`. These carry token-level deltas:
 *   { type: "stream_event", event: { type: "content_block_delta",
 *       delta: { type: "text_delta", text: "..." } } }
 * plus lifecycle frames (message_start / content_block_start / _stop /
 * message_stop) and `thinking_delta`. We stream text_delta tokens live and map
 * thinking_delta to the existing reasoning liveness signal. Tool/json deltas
 * (input_json_delta) are ignored — the final assistant message still carries
 * the complete tool_use block. All field accesses are guarded (objects, not
 * arrays/null) to match the rest of the parser.
 */
function parseClaudeStreamEvent(event: JsonObject): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  const inner =
    event.event &&
    typeof event.event === "object" &&
    !Array.isArray(event.event)
      ? event.event
      : null;
  if (!inner) return events;
  if (inner.type === "message_start") {
    events.push({ kind: "mark_message_start" });
    return events;
  }
  if (inner.type === "content_block_start") {
    // A new text block opening mid-message (interleaved thinking emits
    // text → thinking → text with no message_start between) needs a paragraph
    // break so the blocks do not clump. Only text blocks — thinking/tool blocks
    // are not appended to the streamed content.
    const contentBlock =
      inner.content_block &&
      typeof inner.content_block === "object" &&
      !Array.isArray(inner.content_block)
        ? inner.content_block
        : null;
    if (contentBlock && contentBlock.type === "text") {
      events.push({ kind: "mark_text_block_start" });
    }
    return events;
  }
  if (inner.type !== "content_block_delta") return events;
  const delta =
    inner.delta &&
    typeof inner.delta === "object" &&
    !Array.isArray(inner.delta)
      ? inner.delta
      : null;
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

export function claudeParseLine(event: JsonObject): CanonicalEvent[] {
  if (consumesClaudeSdkTaxonomyMessage(event)) {
    return parseClaudeSdkTaxonomy(event);
  }
  const events: CanonicalEvent[] = [];
  if (event.type === "stream_event") {
    return parseClaudeStreamEvent(event);
  }
  if (event.type === "tool_result") {
    const toolUseId =
      typeof event.tool_use_id === "string" && event.tool_use_id.trim()
        ? event.tool_use_id.trim()
        : undefined;
    const resultText =
      event.content !== undefined ? extractToolResultText(event.content) : "";
    const isError = event.is_error === true;
    if (toolUseId) {
      trackClaudeToolResult(toolUseId, resultText, isError);
    }
    const result = claudeToolCompleteResult(resultText, isError);
    events.push(
      result
        ? { kind: "complete_tool", trackingId: toolUseId, result }
        : { kind: "complete_tool", trackingId: toolUseId },
    );
    return events;
  }
  if (event.type === "user") {
    const message =
      event.message &&
      typeof event.message === "object" &&
      !Array.isArray(event.message)
        ? event.message
        : null;
    const content =
      message && Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      if (!block || typeof block !== "object" || Array.isArray(block)) continue;
      if (
        block.type === "tool_result" &&
        typeof block.tool_use_id === "string" &&
        block.tool_use_id.trim()
      ) {
        const toolUseId = block.tool_use_id.trim();
        const resultText =
          block.content !== undefined
            ? extractToolResultText(block.content)
            : "";
        const isError = block.is_error === true;
        trackClaudeToolResult(toolUseId, resultText, isError);
        const result = claudeToolCompleteResult(resultText, isError);
        events.push(
          result
            ? { kind: "complete_tool", trackingId: toolUseId, result }
            : { kind: "complete_tool", trackingId: toolUseId },
        );
      }
    }
    if (events.length > 0) {
      return events;
    }
  }
  if (event.type !== "assistant") return events;

  if (S.waitingForFirstAssistantEvent) {
    events.push({ kind: "mark_first_assistant" });
  }
  const message =
    event.message &&
    typeof event.message === "object" &&
    !Array.isArray(event.message)
      ? event.message
      : null;
  const content =
    message && Array.isArray(message.content) ? message.content : [];
  // Set on messages produced INSIDE a subagent — the parent `Agent` tool_use id.
  // The UI nests these steps under the matching `subtask` row.
  const parentToolUseId =
    typeof event.parent_tool_use_id === "string" &&
    event.parent_tool_use_id.trim()
      ? event.parent_tool_use_id.trim()
      : undefined;
  for (const block of content) {
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    if (block.type === "tool_use" && typeof block.name === "string") {
      const input =
        block.input &&
        typeof block.input === "object" &&
        !Array.isArray(block.input)
          ? block.input
          : {};
      // Todo tools drive a single evolving checklist, not one activity row per
      // call. Read-only variants add nothing to the timeline.
      if (
        block.name === "TodoWrite" ||
        block.name === "TaskCreate" ||
        block.name === "TaskUpdate"
      ) {
        events.push({
          kind: "set_todos",
          todos: reduceTodoState(block.name, input),
        });
        continue;
      }
      if (
        block.name === "TodoRead" ||
        block.name === "TaskGet" ||
        block.name === "TaskList" ||
        block.name === "ExitPlanMode"
      ) {
        continue;
      }
      const step = toolCallToStep(block.name, input);
      const trackingId =
        typeof block.id === "string" && block.id.trim()
          ? block.id.trim()
          : undefined;
      if (trackingId) {
        step.toolUseId = trackingId;
        trackClaudeToolUse(block.name, input, trackingId);
      }
      if (parentToolUseId) step.parentToolUseId = parentToolUseId;
      events.push(
        trackingId
          ? { kind: "push_step", step, trackingId }
          : { kind: "push_step", step },
      );
      // Fire-and-forget question metadata (surfaced after the turn). Skipped in
      // blocking mode, where canUseTool owns the question round-trip and driving
      // this too would double-render the question in the UI.
      if (
        !BLOCKING_QUESTIONS_ENABLED &&
        block.name === "AskUserQuestion" &&
        block.input
      ) {
        events.push({
          kind: "set_pending_question",
          data: JSON.stringify(block.input),
        });
      }
    } else if (
      block.type === "thinking" &&
      "thinking" in block &&
      block.thinking
    ) {
      events.push({ kind: "update_reasoning", text: String(block.thinking) });
    } else if (block.type === "text" && "text" in block && block.text) {
      // Dedup: when text was already streamed live via text_delta partials
      // (flag set in applyCanonicalEvents), the final assistant message repeats
      // the same complete text — skip it to avoid doubling. When no deltas
      // streamed (flag false — non-partial path or other frames), append as the
      // fallback so text is never lost.
      if (!S.streamedAssistantTextThisMessage) {
        events.push({ kind: "append_text", text: String(block.text) });
      }
    }
  }
  return events;
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
    const message =
      parsed.message &&
      typeof parsed.message === "object" &&
      !Array.isArray(parsed.message)
        ? parsed.message
        : null;
    const contentBlocks =
      message && Array.isArray(message.content) ? message.content : [];
    for (const block of contentBlocks) {
      if (
        block &&
        typeof block === "object" &&
        !Array.isArray(block) &&
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
