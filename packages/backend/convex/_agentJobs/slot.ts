import type { WorkflowId } from "@convex-dev/workflow";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { cancelTrackedWorkflow, isTrackedWorkflowRunning } from "../workflowManager";
import { closeTurn, findOpenTurn } from "../_chat/turnStore";
import { clearStreamingActivity } from "../_taskWorkflow/helpers";
import { RUN_TIMEOUT_MS } from "../_taskWorkflow/staleness";
import { resolveSandboxRepoId } from "../_githubRepos/helpers";
import { scheduleArenaCheckCompletion } from "../_arena/browserRun";
import { buildStaleDocPatch } from "../_prRecapWorkflow/staleDoc";
import {
  agentJobOwner,
  agentJobStreamingEntityIds,
  type AgentJobOwner,
  type AgentJobOwnerId,
} from "./owner";

/** Refusal text when the owner's slot is taken. The doc dialogs show it. */
function busyMessage(owner: AgentJobOwner): string {
  return owner.kind === "doc"
    ? "Another document task is still running. Wait for it to finish."
    : "This job is already running.";
}

/**
 * Starts a one-shot agent job: refuses while another job holds the owner's
 * slot, fills the slot with the new workflow and schedules the backstop. Every
 * job starts here, so no start path can overwrite a running job's slot.
 */
export async function startAgentJob(
  ctx: MutationCtx,
  ownerId: AgentJobOwnerId,
  start: () => Promise<WorkflowId>,
): Promise<string> {
  const owner = agentJobOwner(ctx.db, ownerId);
  const row = await ctx.db.get(ownerId);
  if (!owner || !row) throw new Error("Not found");
  // The component, not the field, says whether the slot is busy: a slot left
  // by a workflow that ended without clearing it reads as free.
  if (await isTrackedWorkflowRunning(ctx, row.activeWorkflowId)) {
    throw new Error(busyMessage(owner));
  }
  const workflowId = String(await start());
  await ctx.db.patch(ownerId, { activeWorkflowId: workflowId });
  await ctx.scheduler.runAfter(RUN_TIMEOUT_MS, internal.agentJobs.handleStale, {
    ownerId,
    workflowId,
  });
  return workflowId;
}

/** The job's turn: the one its workflow opened, else the owner's open turn. */
async function findJobTurn(
  ctx: MutationCtx,
  owner: AgentJobOwner,
  workflowId: string | undefined,
): Promise<Doc<"turns"> | null> {
  if (workflowId === undefined) return await findOpenTurn(ctx, owner.id);
  return await ctx.db
    .query("turns")
    .withIndex("by_workflow", (q) => q.eq("workflowId", workflowId))
    .first();
}

/**
 * The sandbox a stopped job leaves running. Every job but the doc interview
 * runs on an ephemeral sandbox; the interview keeps the doc's sandbox for the
 * next question. An automation records its sandbox before launch, so a run
 * stopped before its turn opened still finds it.
 */
async function ephemeralJobSandbox(
  ctx: MutationCtx,
  owner: AgentJobOwner,
  turn: Doc<"turns"> | null,
): Promise<{ sandboxId: string; repoId: Id<"githubRepos"> } | null> {
  const fromTurn =
    turn?.sandboxId !== undefined
      ? { sandboxId: turn.sandboxId, repoId: turn.repoId }
      : null;
  switch (owner.kind) {
    case "doc": {
      const doc = await ctx.db.get(owner.id);
      return fromTurn && doc?.sandboxId !== fromTurn.sandboxId
        ? fromTurn
        : null;
    }
    case "evaluation":
      return fromTurn;
    case "automation": {
      if (fromTurn) return fromTurn;
      const run = await ctx.db.get(owner.id);
      if (run?.sandboxId === undefined) return null;
      return {
        sandboxId: run.sandboxId,
        repoId: await resolveSandboxRepoId(ctx.db, run.repoId),
      };
    }
  }
}

/**
 * Stops a job from outside its workflow (cancel, stall, backstop). A
 * cancelled workflow never reaches its `finally`, so this closes the turn,
 * clears the streaming rows and deletes the ephemeral sandbox in its place.
 * The caller writes the owner's own end state.
 */
export async function stopAgentJob(
  ctx: MutationCtx,
  owner: AgentJobOwner,
  workflowId: string | undefined,
  end: { state: "cancelled" } | { state: "error"; error: string },
): Promise<void> {
  await cancelTrackedWorkflow(ctx, workflowId);
  const turn = await findJobTurn(ctx, owner, workflowId);
  if (turn) {
    await closeTurn(
      ctx,
      turn,
      end.state,
      end.state === "error" ? { error: end.error } : {},
    );
  }
  const streamingEntityIds = new Set(agentJobStreamingEntityIds(owner));
  if (turn) streamingEntityIds.add(turn.streamingEntityId);
  for (const streamingEntityId of streamingEntityIds) {
    await clearStreamingActivity(ctx, streamingEntityId);
  }
  const sandbox = await ephemeralJobSandbox(ctx, owner, turn);
  if (sandbox) {
    await ctx.scheduler.runAfter(0, internal.sandbox.deleteSandbox, sandbox);
  }
}

/**
 * Tears down a job that ran too long or stalled, when it still holds the
 * owner's slot, and marks the owner failed. Shared by the `RUN_TIMEOUT_MS`
 * backstop (`agentJobs.handleStale`) and the turn lease reconciler.
 */
export async function tearDownStaleAgentJob(
  ctx: MutationCtx,
  owner: AgentJobOwner,
  workflowId: string,
  error: string,
): Promise<void> {
  const row = await ctx.db.get(owner.id);
  if (!row || row.activeWorkflowId !== workflowId) return;
  await stopAgentJob(ctx, owner, workflowId, { state: "error", error });
  const now = Date.now();
  switch (owner.kind) {
    case "doc": {
      const doc = await ctx.db.get(owner.id);
      if (doc) await ctx.db.patch(owner.id, buildStaleDocPatch(doc, now));
      return;
    }
    case "evaluation": {
      const report = await ctx.db.get(owner.id);
      if (!report) return;
      if (report.status === "completed" && report.fixStatus === "fixing") {
        await ctx.db.patch(owner.id, {
          fixStatus: "fix_error",
          activeWorkflowId: undefined,
          updatedAt: now,
        });
        return;
      }
      await ctx.db.patch(owner.id, {
        status: "error",
        error,
        activeWorkflowId: undefined,
        updatedAt: now,
      });
      await scheduleArenaCheckCompletion(ctx, report);
      return;
    }
    case "automation":
      await ctx.db.patch(owner.id, {
        status: "error",
        error,
        finishedAt: now,
        activeWorkflowId: undefined,
      });
      return;
  }
}
