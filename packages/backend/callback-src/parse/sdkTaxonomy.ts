import { Option, Schema } from "effect";
import { callbackState as S } from "../runtime/state.js";
import { mergeClaudeRateLimitEvent } from "../runtime/usageLimits.js";
import type { CanonicalEvent, JsonObject } from "../types.js";
import { log } from "../utils.js";
import { lenient, OptionalText, Text, TextArray } from "./schemaHelpers.js";

const loggedUnknownKinds = new Set<string>();

/** Task ids seen in prior `background_tasks_changed` payloads (daemon session). */
const knownBackgroundTaskIds = new Set<string>();

/** The `type`/`subtype` pair every SDK message is dispatched on. */
const SdkEnvelope = Schema.Struct({
  type: Text,
  subtype: OptionalText,
});

/** A `system:status` message, which keeps an active status row alive. */
const StatusMessage = Schema.Struct({
  type: Text.pipe(Schema.filter((value) => value === "system")),
  subtype: Schema.Literal("status"),
});

/** `status` is matched untrimmed — the SDK sends this field verbatim. */
const CompactingStatus = Schema.Struct({
  status: Schema.Literal("compacting"),
});

const ToolProgress = Schema.Struct({
  tool_use_id: Text,
  elapsed_time_seconds: Schema.Number.pipe(Schema.finite()),
});

/** A summary is only usable when it names at least one step to patch. */
const ToolUseSummary = Schema.Struct({
  summary: Text,
  preceding_tool_use_ids: TextArray.pipe(Schema.minItems(1)),
});

const FilesPersisted = Schema.Struct({
  files: Schema.optional(
    lenient(Schema.Array(lenient(Schema.Struct({ filename: OptionalText })))),
  ),
});

const HookStarted = Schema.Struct({
  hook_id: Text,
  hook_name: OptionalText,
});

const HookProgress = Schema.Struct({
  hook_id: Text,
  output: OptionalText,
  stdout: OptionalText,
  stderr: OptionalText,
});

const HookResponse = Schema.Struct({
  hook_id: Text,
});

const BackgroundTasksChanged = Schema.Struct({
  tasks: Schema.optional(
    lenient(
      Schema.Array(
        lenient(
          Schema.Struct({ task_id: OptionalText, description: OptionalText }),
        ),
      ),
    ),
  ),
});

const ModelReroute = Schema.Struct({
  reason: OptionalText,
  message: OptionalText,
  content: OptionalText,
});

const decodeEnvelope = Schema.decodeUnknownOption(SdkEnvelope);
const decodeStatusMessage = Schema.decodeUnknownOption(StatusMessage);
const decodeCompactingStatus = Schema.decodeUnknownOption(CompactingStatus);
const decodeToolProgress = Schema.decodeUnknownOption(ToolProgress);
const decodeToolUseSummary = Schema.decodeUnknownOption(ToolUseSummary);
const decodeFilesPersisted = Schema.decodeUnknownOption(FilesPersisted);
const decodeHookStarted = Schema.decodeUnknownOption(HookStarted);
const decodeHookProgress = Schema.decodeUnknownOption(HookProgress);
const decodeHookResponse = Schema.decodeUnknownOption(HookResponse);
const decodeBackgroundTasks = Schema.decodeUnknownOption(
  BackgroundTasksChanged,
);
const decodeModelReroute = Schema.decodeUnknownOption(ModelReroute);

/** Shapes whose every field is optional, so an object payload always decodes. */
type FilesPersistedFields = Schema.Schema.Type<typeof FilesPersisted>;
type BackgroundTasksFields = Schema.Schema.Type<typeof BackgroundTasksChanged>;
type ModelRerouteFields = Schema.Schema.Type<typeof ModelReroute>;

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

function patchStepsWithSummary(
  toolUseIds: readonly string[],
  summary: string,
): void {
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
  const fields = Option.getOrElse(
    decodeFilesPersisted(event),
    (): FilesPersistedFields => ({}),
  );
  const names: string[] = [];
  for (const entry of fields.files ?? []) {
    if (entry?.filename) names.push(entry.filename);
  }
  return names.join(", ");
}

/** Background tasks carrying an id, in payload order (duplicates included). */
function readBackgroundTasks(
  event: JsonObject,
): { id: string; description?: string }[] {
  const fields = Option.getOrElse(
    decodeBackgroundTasks(event),
    (): BackgroundTasksFields => ({}),
  );
  const tasks: { id: string; description?: string }[] = [];
  for (const task of fields.tasks ?? []) {
    if (task?.task_id) {
      tasks.push({ id: task.task_id, description: task.description });
    }
  }
  return tasks;
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

function parseModelReroute(
  event: JsonObject,
  subtype: string,
): CanonicalEvent[] | null {
  if (
    subtype !== "model_reroute" &&
    subtype !== "model_fallback" &&
    subtype !== "informational"
  ) {
    return null;
  }
  const fields = Option.getOrElse(
    decodeModelReroute(event),
    (): ModelRerouteFields => ({}),
  );
  if (subtype === "informational") {
    const content = fields.content;
    if (
      content &&
      (content.toLowerCase().includes("rerouted") ||
        content.toLowerCase().includes("fallback model"))
    ) {
      return pushNoticeStep("Model rerouted", content);
    }
    return null;
  }
  return pushNoticeStep(
    "Model rerouted",
    fields.reason ?? fields.message ?? fields.content,
  );
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
  const envelope = decodeEnvelope(event);
  if (Option.isNone(envelope)) return false;
  const { type: messageType, subtype } = envelope.value;
  if (
    messageType === "tool_progress" ||
    messageType === "tool_use_summary" ||
    messageType === "auth_status" ||
    messageType === "rate_limit_event"
  ) {
    return true;
  }
  if (messageType !== "system") return false;
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
  const envelope = decodeEnvelope(event);
  if (Option.isNone(envelope)) return [];
  const { type: messageType, subtype } = envelope.value;

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
    const progress = decodeToolProgress(event);
    if (Option.isSome(progress)) {
      const seconds = Math.max(
        0,
        Math.floor(progress.value.elapsed_time_seconds),
      );
      patchStepDetailByToolUseId(
        progress.value.tool_use_id,
        `${seconds}s elapsed`,
      );
    }
    return [];
  }

  if (messageType === "tool_use_summary") {
    completeActiveStatusStep();
    const summary = decodeToolUseSummary(event);
    if (Option.isSome(summary)) {
      patchStepsWithSummary(
        summary.value.preceding_tool_use_ids,
        summary.value.summary,
      );
    }
    return [];
  }

  if (!subtype) {
    logUnknownSdkKind(`${messageType}:?`);
    return [];
  }

  if (subtype === "thinking_tokens") {
    return [];
  }

  if (subtype === "status") {
    if (Option.isSome(decodeCompactingStatus(event))) {
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
    const hook = decodeHookStarted(event);
    if (Option.isNone(hook)) return [];
    const hookId = hook.value.hook_id;
    return [
      { kind: "mark_last_complete" },
      {
        kind: "push_step",
        step: {
          type: "hook",
          label: hook.value.hook_name ?? "Hook",
          toolUseId: hookId,
          status: "active",
        },
        trackingId: hookId,
      },
    ];
  }

  if (subtype === "hook_progress") {
    const hook = decodeHookProgress(event);
    if (Option.isSome(hook)) {
      const output =
        hook.value.output ?? hook.value.stdout ?? hook.value.stderr;
      if (output) {
        appendHookDetail(hook.value.hook_id, output);
      }
    }
    return [];
  }

  if (subtype === "hook_response") {
    const hook = decodeHookResponse(event);
    if (Option.isNone(hook)) return [];
    return [{ kind: "complete_tool", trackingId: hook.value.hook_id }];
  }

  if (subtype === "background_tasks_changed") {
    const tasks = readBackgroundTasks(event);
    const descriptions = new Map<string, string>();
    for (const task of tasks) {
      if (task.description) {
        descriptions.set(task.id, task.description);
      }
    }
    const newly = diffNewBackgroundTaskIds(tasks.map((task) => task.id));
    const events: CanonicalEvent[] = [];
    for (const taskId of newly) {
      events.push(
        ...pushNoticeStep(
          "Agent moved to background",
          descriptions.get(taskId) ?? taskId,
        ),
      );
    }
    return events;
  }

  const reroute = parseModelReroute(event, subtype);
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
  if (Option.isSome(decodeStatusMessage(event))) {
    return;
  }
  completeActiveStatusStep();
}

export function resetSdkTaxonomyStateForTest(): void {
  loggedUnknownKinds.clear();
  knownBackgroundTaskIds.clear();
}
