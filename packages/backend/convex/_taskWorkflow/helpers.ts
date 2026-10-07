import type { MutationCtx } from "../_generated/server";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { Infer, Validator } from "convex/values";
import { LlmJson } from "@solvers-hub/llm-json";
import { toWorkflowId, workflow } from "../workflowManager";
import { buildProjectBranchName } from "../_projects/helpers";
import { preferPersistedSandboxId } from "../_sandbox/resolveExistingSandboxId";
import { isUsageLimitError, parseUsageLimitResetTime } from "./recovery";
import { scheduleTaskOrchestratorNotify } from "../orchestratorShared";
import { deriveLogUsage } from "../_logs/usage";

export const llmJson = new LlmJson({ attemptCorrection: true });

export async function resolveTaskBranchName(
  db: GenericDatabaseReader<DataModel>,
  task: Doc<"agentTasks">,
): Promise<string> {
  if (task.projectId) {
    const project = await db.get(task.projectId);
    return (
      project?.branchName ??
      buildProjectBranchName(task.projectId, project?.branchVersion)
    );
  }
  return `eva/task-${String(task._id)}`;
}

/** Resolves the sandbox id to use for a task run (push). */
export async function resolveTaskSandboxIdForRun(
  db: GenericDatabaseReader<DataModel>,
  task: Doc<"agentTasks">,
  run: Doc<"agentRuns">,
): Promise<string | undefined> {
  if (task.projectId) {
    const project = await db.get(task.projectId);
    return preferPersistedSandboxId({
      sandboxId: project?.sandboxId ?? run.sandboxId,
    });
  }
  return preferPersistedSandboxId({
    sandboxId: run.sandboxId ?? task.sandboxId,
  });
}

/** Returns the streaming entity ID used for a task run's activity stream. */
export function getTaskRunStreamingEntityId(runId: Id<"agentRuns">): string {
  return `task-run-${String(runId)}`;
}

/** Deletes the streaming activity record for a given entity ID. */
export async function clearStreamingActivity(
  ctx: MutationCtx,
  entityId: string,
): Promise<void> {
  const streamingRows = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .collect();
  for (const streaming of streamingRows) {
    await ctx.db.delete(streaming._id);
  }
}

/** Creates or updates the streaming activity record for a given entity. */
export async function upsertStreamingActivity(
  ctx: MutationCtx,
  entityId: string,
  currentActivity: string,
): Promise<void> {
  const existing = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .first();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { currentActivity, lastUpdatedAt: now });
  } else {
    await ctx.db.insert("streamingActivity", {
      entityId,
      currentActivity,
      lastUpdatedAt: now,
    });
  }
}

/** Creates or updates a persistent activity log entry for a run. */
export async function upsertActivityLog(
  ctx: MutationCtx,
  runId: Id<"agentRuns">,
  activityLog: string,
): Promise<void> {
  const existing = await ctx.db
    .query("agentRunActivityLogs")
    .withIndex("by_run_and_type", (q) => q.eq("runId", runId).eq("type", "run"))
    .first();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { activityLog, updatedAt: now });
  } else {
    await ctx.db.insert("agentRunActivityLogs", {
      runId,
      activityLog,
      type: "run",
      updatedAt: now,
    });
  }
}

/** Copies current streaming activity into a persistent activity log before cleanup. */
export async function snapshotStreamingActivityToLog(
  ctx: MutationCtx,
  entityId: string,
  runId: Id<"agentRuns">,
): Promise<void> {
  const streaming = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .first();
  if (streaming?.currentActivity) {
    await upsertActivityLog(ctx, runId, streaming.currentActivity);
  }
}

/** Builds a human-readable summary string for a completed run result. */
export function buildRunResultSummary(
  success: boolean,
  prUrl: string | null,
  projectId: Id<"projects"> | undefined,
  claudeResult?: string,
): string | undefined {
  if (!success) return undefined;
  if (claudeResult) return claudeResult;
  if (prUrl) return projectId ? "Created project PR" : "Created task PR";
  return projectId
    ? "Pushed commit to project branch"
    : "Pushed commit to task branch";
}

/** Patches the run document with final status, error, PR URL, and result summary. */
export async function finalizeRunStatus(
  ctx: MutationCtx,
  params: {
    runId: Id<"agentRuns">;
    projectId: Id<"projects"> | undefined;
    success: boolean;
    error: string | null;
    prError: string | null;
    prUrl: string | null;
    exitReason?: string;
    claudeResult?: string;
  },
): Promise<void> {
  const run = await ctx.db.get(params.runId);
  if (!run || (run.status !== "queued" && run.status !== "running")) return;

  const errorMessage = params.success
    ? undefined
    : (params.error ?? "Unknown error");
  const isRateLimit = errorMessage ? isUsageLimitError(errorMessage) : false;
  const limitResetAt =
    isRateLimit && errorMessage
      ? (parseUsageLimitResetTime(errorMessage) ?? undefined)
      : undefined;

  await ctx.db.patch(params.runId, {
    status: params.success ? "success" : "error",
    finalizingAt: undefined,
    finishedAt: Date.now(),
    resultSummary: buildRunResultSummary(
      params.success,
      params.prUrl,
      params.projectId,
      params.claudeResult,
    ),
    prUrl: params.prUrl ?? undefined,
    error: errorMessage,
    prError: params.prError ?? undefined,
    exitReason: params.exitReason ?? (params.success ? "completed" : "error"),
    errorType: isRateLimit ? ("rate_limit" as const) : undefined,
    limitResetAt,
  });

  // Single terminal-status choke point for a run, and it is guarded above
  // against re-finalizing — so a watched task's master is woken exactly once
  // whether the run ended via finalizeRunStreamingPhase or completeRun.
  await scheduleTaskOrchestratorNotify(
    ctx,
    run.taskId,
    params.success ? "success" : "error",
  );
}

/** Extracts a JSON block from text, handling code fences and raw JSON objects. */
export function extractJsonBlock(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch && codeBlockMatch[1]) return codeBlockMatch[1].trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return text;
}

/** Returns the first JSON value parsed from LLM output, or undefined if none found. */
export function extractFirstJsonValue(text: string): unknown {
  const { json } = llmJson.extract(text);
  return json.length > 0 ? json[0] : undefined;
}

/**
 * Sends a completion event to a tracked workflow.
 *
 * Centralizes the branded-WorkflowId boundary so callers can pass the raw string
 * ID stored on the entity (e.g. `entity.activeWorkflowId`) without needing
 * their own cast.
 */
export async function sendCompletionEvent<
  Name extends string,
  V extends Validator<unknown, "required", string>,
>(
  ctx: MutationCtx,
  event: { name: Name; validator: V },
  workflowId: string,
  value: Infer<V>,
): Promise<void> {
  await workflow.sendEvent(ctx, {
    ...event,
    workflowId: toWorkflowId(workflowId),
    value,
  });
}

/** Inserts a completion log row used by sandbox-callback handlers across workflows. */
export async function recordCompletionLog(
  ctx: MutationCtx,
  params: {
    entityType: string;
    entityId: string;
    entityTitle: string;
    repoId: Id<"githubRepos">;
    rawResultEvent: string | undefined;
    projectId?: Id<"projects">;
  },
): Promise<void> {
  await ctx.db.insert("logs", {
    entityType: params.entityType,
    entityId: params.entityId,
    entityTitle: params.entityTitle,
    rawResultEvent: params.rawResultEvent,
    repoId: params.repoId,
    projectId: params.projectId,
    createdAt: Date.now(),
    ...deriveLogUsage(params.rawResultEvent),
  });
}
