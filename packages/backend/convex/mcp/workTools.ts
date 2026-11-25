import { toolErrorResult, toolJsonResult } from "@vvedantb/server";
import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import type { JsonValue } from "../_jev/jsonValue";
import {
  entityAccess,
  entityRefArgs,
  entitySummary,
  type EntityKind,
  type EntityRef,
  type EntityTarget,
} from "./entityRef";
import {
  confirmedDeleteArg,
  guarded,
  mcpCallAsUser,
  mcpGetContext,
  type McpCredentials,
} from "./toolShared";
import { defineTool, type EvaTool } from "./registry";
import { projectCallerOf } from "./projectScope";
import { projectTaskRefArgs, resolveProjectTaskRef } from "./projectTools";
import { internal } from "../_generated/api";

const taskIdArg = z
  .string()
  .optional()
  .describe(
    'The quick task\'s Convex id. Alternatively name it with "id", "prUrl", or "numId" plus repoName.',
  );

const scheduledAtArg = z
  .string()
  .datetime({ offset: true })
  .describe(
    'When to run, as an ISO 8601 time with a zone, e.g. "2026-10-01T09:00:00Z". Must be in the future.',
  );

/** Every backing mutation here returns null; parsing it proves the call landed. */
const nullReply = z.null();

/**
 * Work lifecycle tools: run, schedule and cancel project builds, and edit,
 * schedule, delete and restore quick tasks. Each is the same public mutation
 * the Eva UI button calls, run as the user, so its access checks and gates
 * apply unchanged.
 *
 * Deliberately absent: task status and review state (a person's call).
 */
export function workTools(
  credentials: McpCredentials,
  ctx: ActionCtx,
): EvaTool[] {
  const tools: EvaTool[] = [];
  const { clerkUserId } = credentials;
  const { resolveEntityTarget } = entityAccess(ctx, credentials);

  /** Resolves a ref to one chat of `kind`, taking a bare id as that kind. */
  async function resolveKind(
    kind: EntityKind,
    directId: string | undefined,
    ref: EntityRef,
  ): Promise<{ target: EntityTarget } | ReturnType<typeof toolErrorResult>> {
    if (ref.kind !== undefined && ref.kind !== kind) {
      return toolErrorResult(`This tool acts on a ${kind}, not a ${ref.kind}.`);
    }
    const { userId } = await mcpGetContext(ctx, clerkUserId);
    const resolved = await resolveEntityTarget(
      directId !== undefined
        ? { ...ref, id: directId, kind }
        : { ...ref, kind },
      userId,
    );
    if ("content" in resolved) return resolved;
    if (resolved.target.kind !== kind) {
      return toolErrorResult(
        `That reference is a ${resolved.target.kind}, not a ${kind}.`,
      );
    }
    return resolved;
  }

  function runMutation(path: string, args: Record<string, JsonValue>) {
    return mcpCallAsUser(
      ctx,
      clerkUserId,
      { type: "mutation", path, args },
      nullReply,
    );
  }

  /** Parses an ISO time to epoch ms, rejecting the past before the backend does. */
  function futureTime(
    iso: string,
  ): number | ReturnType<typeof toolErrorResult> {
    const at = Date.parse(iso);
    if (at <= Date.now()) {
      return toolErrorResult(
        `"${iso}" is not in the future. Pick a later time.`,
      );
    }
    return at;
  }

  const taskInput = { taskId: taskIdArg, ...entityRefArgs };
  // update_task and delete_task also take a task's number in the caller's
  // project (`projectTaskRefArgs`), so a coordinator names "#3" directly.
  const projectTaskInput = {
    ...entityRefArgs,
    ...projectTaskRefArgs,
  };
  const caller = projectCallerOf(credentials.owner);

  /** A task named by id, by its number in the caller's project, or by ref. */
  async function resolveTask(
    ref: EntityRef & { taskId?: string; taskNumber?: number },
  ): Promise<{ target: EntityTarget } | ReturnType<typeof toolErrorResult>> {
    const { taskId, taskNumber, ...rest } = ref;
    const directId = await resolveProjectTaskRef(ctx, caller, {
      taskId,
      taskNumber,
    });
    if (typeof directId === "object") return directId;
    return resolveKind("task", directId, rest);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Quick task lifecycle
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "update_task",
      description: `Edit a task's title, description, tags, priority or base branch (and a project task's phaseLabel). Only the fields you pass change.

Status and review state cannot be changed here; those stay a person's call. "tags" replaces the whole tag list. "priority": null clears it.

In a project coordinator chat, name the task by taskNumber; you can change only tasks of this project that have not started.`,
      mutating: true,
      input: {
        ...projectTaskInput,
        phaseLabel: z
          .string()
          .optional()
          .describe("Project coordinator only: the task's phase label. Empty clears it."),
        title: z.string().min(1).optional().describe("New title."),
        description: z
          .string()
          .optional()
          .describe("New description (the task's prompt), as markdown."),
        tags: z.array(z.string()).optional().describe("Replacement tag list."),
        priority: z
          .enum(["urgent", "high", "medium", "low"])
          .nullable()
          .optional()
          .describe("New priority, or null to clear it."),
        baseBranch: z
          .string()
          .optional()
          .describe("Branch the task's work is based on."),
      },
      handler: async ({
        title,
        description,
        tags,
        priority,
        baseBranch,
        phaseLabel,
        ...ref
      }) => {
        const updates: Record<string, JsonValue> = {};
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (tags !== undefined) updates.tags = tags;
        if (priority !== undefined) updates.priority = priority;
        if (baseBranch !== undefined) updates.baseBranch = baseBranch;
        if (Object.keys(updates).length === 0 && phaseLabel === undefined) {
          return toolErrorResult(
            'Nothing to change: pass at least one of "title", "description", "tags", "priority", "baseBranch" or "phaseLabel".',
          );
        }
        if (phaseLabel !== undefined && caller?.role !== "coordinator") {
          return toolErrorResult(
            "Only a project coordinator sets a task's phaseLabel.",
          );
        }
        const resolved = await resolveTask(ref);
        if ("content" in resolved) return resolved;
        const { target } = resolved;
        if (caller?.role === "coordinator") {
          // Only a task not started yet.
          const refused = await guarded(async () => {
            await ctx.runMutation(
              internal.mcp.projectQueries.editTaskAsCoordinator,
              {
                projectId: caller.projectId,
                taskId: target.targetId,
                ...(phaseLabel !== undefined ? { phaseLabel } : {}),
              },
            );
            return null;
          });
          if (refused !== null) return refused;
        }
        if (Object.keys(updates).length > 0) {
          await runMutation("agentTasks:update", {
            id: target.targetId,
            ...updates,
          });
        }
        return toolJsonResult({
          ...entitySummary(target),
          updated: [
            ...Object.keys(updates),
            ...(phaseLabel !== undefined ? ["phaseLabel"] : []),
          ],
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "schedule_task",
      description: `Schedule a quick task to start running at a future time. Use update_scheduled_task to move an existing schedule.

Only tasks in "todo" can be scheduled, and not while a run is queued or running. The time must be in the future.`,
      mutating: true,
      input: { ...taskInput, scheduledAt: scheduledAtArg },
      handler: async ({ taskId, scheduledAt, ...ref }) => {
        const at = futureTime(scheduledAt);
        if (typeof at !== "number") return at;
        const resolved = await resolveKind("task", taskId, ref);
        if ("content" in resolved) return resolved;
        const { target } = resolved;
        await runMutation("agentTasks:scheduleExecution", {
          id: target.targetId,
          scheduledAt: at,
        });
        return toolJsonResult({
          ...entitySummary(target),
          run: "scheduled",
          scheduledAt: new Date(at).toISOString(),
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "update_scheduled_task",
      description: `Move a quick task's scheduled run to a new future time. Any existing schedule is replaced; with none, this creates one. Rejected when the time is not in the future.`,
      mutating: true,
      input: { ...taskInput, scheduledAt: scheduledAtArg },
      handler: async ({ taskId, scheduledAt, ...ref }) => {
        const at = futureTime(scheduledAt);
        if (typeof at !== "number") return at;
        const resolved = await resolveKind("task", taskId, ref);
        if ("content" in resolved) return resolved;
        const { target } = resolved;
        await runMutation("agentTasks:updateScheduledExecution", {
          id: target.targetId,
          scheduledAt: at,
        });
        return toolJsonResult({
          ...entitySummary(target),
          run: "rescheduled",
          scheduledAt: new Date(at).toISOString(),
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "cancel_scheduled_task",
      description: `Cancel a quick task's scheduled run before it starts. The task stays in todo. Does not stop a run already in progress (use stop_agent). Rejected when the task is not scheduled.`,
      mutating: true,
      input: taskInput,
      handler: async ({ taskId, ...ref }) => {
        const resolved = await resolveKind("task", taskId, ref);
        if ("content" in resolved) return resolved;
        const { target } = resolved;
        await runMutation("agentTasks:cancelScheduledExecution", {
          id: target.targetId,
        });
        return toolJsonResult({
          ...entitySummary(target),
          run: "schedule_cancelled",
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "delete_task",
      description: `Delete a task (soft delete): it disappears from lists and its url. Ask the user in chat and get an explicit yes first. In a project coordinator chat, name the task by taskNumber; only this project's tasks that have not started.

Deleting also cancels its scheduled run, drops its run summary and queues its sandbox for deletion. restore_task brings the task row back, but none of those.`,
      mutating: true,
      input: { ...projectTaskInput, confirmed: confirmedDeleteArg },
      // `confirmed` rides along in `ref`; the schema already required it.
      handler: async (ref) => {
        const resolved = await resolveTask(ref);
        if ("content" in resolved) return resolved;
        const { target } = resolved;
        if (caller?.role === "coordinator") {
          const refused = await guarded(async () => {
            await ctx.runQuery(
              internal.mcp.projectQueries.assertCoordinatorMayDeleteTask,
              { projectId: caller.projectId, taskId: target.targetId },
            );
            return null;
          });
          if (refused !== null) return refused;
        }
        await runMutation("agentTasks:remove", { id: target.targetId });
        return toolJsonResult({
          ...entitySummary(target),
          deleted: true,
          note: `Restore with restore_task and taskId "${target.targetId}".`,
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "restore_task",
      description: `Undo delete_task: put a soft-deleted quick task back in its lists. Its scheduled run, run summary and sandbox do not come back. Needs the task's Convex id, since a deleted task no longer resolves by number or PR link. A task that is not deleted is left as it is.`,
      mutating: true,
      input: {
        taskId: z
          .string()
          .describe("The deleted task's Convex id, as delete_task returned."),
      },
      handler: async ({ taskId }) => {
        await mcpGetContext(ctx, clerkUserId);
        await runMutation("agentTasks:restore", { id: taskId });
        return toolJsonResult({ kind: "task", id: taskId, restored: true });
      },
    }),
  );

  return tools;
}
