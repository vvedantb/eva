import { callbackState as S } from "../runtime/state.js";
import { mergeClaudeRateLimitEvent } from "../runtime/usageLimits.js";
import type { CanonicalEvent, JsonObject, JsonValue } from "../types.js";
import { log, readTrimmedString } from "../utils.js";

const loggedUnknownKinds = new Set<string>();

/** Task ids seen in prior `background_tasks_changed` payloads (daemon session). */
const knownBackgroundTaskIds = new Set<string>();

function readStringArray(value: JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = readTrimmedString(item);
    if (s) out.push(s);
  }
  return out;
}

function pushNoticeStep(label: string, detail?: string): CanonicalEvent[] {
  return [
    {
      kind: "push_step",
      step: {
        type: "notice",
        label,
        detail,
        status: "complete",
      },
    },
  ];
}

function completeActiveStatusStep(): void {
  for (let i = S.accumulatedSteps.length - 1; i >= 0; i--) {
    const step = S.accumulatedSteps[i];
    if (step.type === "status" && step.status === "active") {
      step.status = "complete";
      return;
    }
  }
}

function patchStepDetailByToolUseId(toolUseId: string, detail: string): void {
  for (let i = S.accumulatedSteps.length - 1; i >= 0; i--) {
    const step = S.accumulatedSteps[i];
    if (step.toolUseId === toolUseId && step.status === "active") {
      step.detail = detail;
      return;
    }
  }
  const last = S.accumulatedSteps[S.accumulatedSteps.length - 1];
  if (last?.status === "active") {
    last.detail = detail;
  }
}

function patchStepsWithSummary(toolUseIds: string[], summary: string): void {
  const idSet = new Set(toolUseIds);
  for (const step of S.accumulatedSteps) {
    if (step.toolUseId && idSet.has(step.toolUseId)) {
      step.detail = summary;
    }
  }
}

function appendHookDetail(hookId: string, detail: string): void {
  for (let i = S.accumulatedSteps.length - 1; i >= 0; i--) {
    const step = S.accumulatedSteps[i];
    if (step.type === "hook" && step.toolUseId === hookId) {
      const trimmed = detail.trim();
      if (!trimmed) return;
      step.detail = step.detail ? `${step.detail}\n${trimmed}` : trimmed;
      return;
    }
  }
}

function readFileNamesFromPersisted(event: JsonObject): string {
  const filesField = event.files;
  if (!Array.isArray(filesField)) return "";
  const names: string[] = [];
  for (const entry of filesField) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const filename = readTrimmedString(entry.filename);
    if (filename) names.push(filename);
  }
  return names.join(", ");
}

function readBackgroundTaskIds(event: JsonObject): string[] {
  const tasksField = event.tasks;
  if (!Array.isArray(tasksField)) return [];
  const ids: string[] = [];
  for (const task of tasksField) {
    if (typeof task !== "object" || task === null || Array.isArray(task)) {
      continue;
    }
    const taskId = readTrimmedString(task.task_id);
    if (taskId) ids.push(taskId);
  }
  return ids;
}

function readBackgroundTaskDescriptions(
  event: JsonObject,
): Map<string, string> {
  const tasksField = event.tasks;
  const descriptions = new Map<string, string>();
  if (!Array.isArray(tasksField)) return descriptions;
  for (const task of tasksField) {
    if (typeof task !== "object" || task === null || Array.isArray(task)) {
      continue;
    }
    const taskId = readTrimmedString(task.task_id);
    const description = readTrimmedString(task.description);
    if (taskId && description) {
      descriptions.set(taskId, description);
    }
  }
  return descriptions;
}

/** Returns newly seen background task ids from a `background_tasks_changed` payload. */
export function diffNewBackgroundTaskIds(taskIds: string[]): string[] {
  const newly: string[] = [];
  for (const id of taskIds) {
    if (!knownBackgroundTaskIds.has(id)) {
      newly.push(id);
    }
  }
  for (const id of taskIds) {
    knownBackgroundTaskIds.add(id);
  }
  return newly;
}

function logUnknownSdkKind(kind: string): void {
  if (loggedUnknownKinds.has(kind)) return;
  loggedUnknownKinds.add(kind);
  log("unhandled sdk kind: " + kind);
}

function parseModelReroute(event: JsonObject): CanonicalEvent[] | null {
  const subtype = readTrimmedString(event.subtype);
  if (subtype === "model_reroute" || subtype === "model_fallback") {
    const reason =
      readTrimmedString(event.reason) ??
      readTrimmedString(event.message) ??
      readTrimmedString(event.content);
    return pushNoticeStep("Model rerouted", reason);
  }
  if (subtype === "informational") {
    const content = readTrimmedString(event.content);
    if (
      content &&
      (content.toLowerCase().includes("rerouted") ||
        content.toLowerCase().includes("fallback model"))
    ) {
      return pushNoticeStep("Model rerouted", content);
    }
  }
  return null;
}

function isTaskSystemSubtype(subtype: string): boolean {
  return (
    subtype === "task_started" ||
    subtype === "task_updated" ||
    subtype === "task_notification" ||
    subtype === "task_progress"
  );
}

/** True when this SDK message is owned by the taxonomy parser (not assistant/tool). */
export function consumesClaudeSdkTaxonomyMessage(event: JsonObject): boolean {
  const messageType =
    typeof event.type === "string" ? event.type.trim() : undefined;
  if (!messageType) return false;
  if (
    messageType === "tool_progress" ||
    messageType === "tool_use_summary" ||
    messageType === "auth_status" ||
    messageType === "rate_limit_event"
  ) {
    return true;
  }
  if (messageType !== "system") return false;
  const subtype =
    typeof event.subtype === "string" ? event.subtype.trim() : undefined;
  if (!subtype || subtype === "init" || isTaskSystemSubtype(subtype)) {
    return false;
  }
  return true;
}

/**
 * Maps Claude Agent SDK system/telemetry messages to canonical activity events.
 * Called from `claudeParseLine` before assistant/tool parsing.
 */
export function parseClaudeSdkTaxonomy(event: JsonObject): CanonicalEvent[] {
  const messageType = readTrimmedString(event.type);
  if (!messageType) return [];

  if (
    messageType !== "system" &&
    messageType !== "tool_progress" &&
    messageType !== "tool_use_summary" &&
    messageType !== "auth_status" &&
    messageType !== "rate_limit_event"
  ) {
    return [];
  }

  // Plan usage-limit state is captured into callback state and reported to
  // Convex at turn end — it is account-level status, not turn activity, so it
  // deliberately produces no timeline row.
  if (messageType === "rate_limit_event") {
    mergeClaudeRateLimitEvent(event);
    return [];
  }

  if (messageType === "auth_status") {
    return [];
  }

  if (messageType === "tool_progress") {
    completeActiveStatusStep();
    const toolUseId = readTrimmedString(event.tool_use_id);
    const elapsed = event.elapsed_time_seconds;
    if (toolUseId && typeof elapsed === "number" && Number.isFinite(elapsed)) {
      const seconds = Math.max(0, Math.floor(elapsed));
      patchStepDetailByToolUseId(toolUseId, `${seconds}s elapsed`);
    }
    return [];
  }

  if (messageType === "tool_use_summary") {
    completeActiveStatusStep();
    const summary = readTrimmedString(event.summary);
    const ids = readStringArray(event.preceding_tool_use_ids);
    if (summary && ids.length > 0) {
      patchStepsWithSummary(ids, summary);
    }
    return [];
  }

  const subtype = readTrimmedString(event.subtype);
  if (!subtype) {
    logUnknownSdkKind(`${messageType}:?`);
    return [];
  }

  if (subtype === "thinking_tokens") {
    return [];
  }

  if (subtype === "status") {
    if (event.status === "compacting") {
      return [
        { kind: "mark_last_complete" },
        {
          kind: "push_step",
          step: {
            type: "status",
            label: "Compacting context...",
            status: "active",
          },
        },
      ];
    }
    return [];
  }

  // Any other handled system subtype completes an in-flight status row.
  completeActiveStatusStep();

  if (subtype === "compact_boundary") {
    return pushNoticeStep("Context compacted");
  }

  if (subtype === "files_persisted") {
    const names = readFileNamesFromPersisted(event);
    return pushNoticeStep(
      "Files persisted",
      names.length > 0 ? names : undefined,
    );
  }

  if (subtype === "hook_started") {
    const hookId = readTrimmedString(event.hook_id);
    const hookName = readTrimmedString(event.hook_name) ?? "Hook";
    if (!hookId) return [];
    return [
      { kind: "mark_last_complete" },
      {
        kind: "push_step",
        step: {
          type: "hook",
          label: hookName,
          toolUseId: hookId,
          status: "active",
        },
        trackingId: hookId,
      },
    ];
  }

  if (subtype === "hook_progress") {
    const hookId = readTrimmedString(event.hook_id);
    const output =
      readTrimmedString(event.output) ??
      readTrimmedString(event.stdout) ??
      readTrimmedString(event.stderr);
    if (hookId && output) {
      appendHookDetail(hookId, output);
    }
    return [];
  }

  if (subtype === "hook_response") {
    const hookId = readTrimmedString(event.hook_id);
    if (!hookId) return [];
    return [{ kind: "complete_tool", trackingId: hookId }];
  }

  if (subtype === "background_tasks_changed") {
    const taskIds = readBackgroundTaskIds(event);
    const descriptions = readBackgroundTaskDescriptions(event);
    const newly = diffNewBackgroundTaskIds(taskIds);
    const events: CanonicalEvent[] = [];
    for (const taskId of newly) {
      const description = descriptions.get(taskId);
      events.push(
        ...pushNoticeStep("Agent moved to background", description ?? taskId),
      );
    }
    return events;
  }

  const reroute = parseModelReroute(event);
  if (reroute) {
    return reroute;
  }

  if (
    subtype !== "init" &&
    subtype !== "task_started" &&
    subtype !== "task_updated" &&
    subtype !== "task_notification" &&
    subtype !== "task_progress"
  ) {
    logUnknownSdkKind(`${messageType}:${subtype}`);
  }

  return [];
}

/** Completes any active status step when a non-status SDK message arrives. */
export function completeStatusOnNonStatusMessage(event: JsonObject): void {
  const messageType = readTrimmedString(event.type);
  if (messageType === "system" && event.subtype === "status") {
    return;
  }
  completeActiveStatusStep();
}

export function resetSdkTaxonomyStateForTest(): void {
  loggedUnknownKinds.clear();
  knownBackgroundTaskIds.clear();
}
