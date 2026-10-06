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
  errorResult,
  mcpCallAsUser,
  mcpGetContext,
  textResult,
  type McpCredentials,
} from "./toolShared";
import { defineTool, type EvaTool } from "./registry";

const projectIdArg = z
  .string()
  .optional()
  .describe(
    'The project\'s Convex id. Alternatively name it with "id", "prUrl", or "numId" plus repoName.',
  );

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
 * Deliberately absent: task status and review state (a person's call) and
 * `deleteCascade` (irreversible, removes the task's history too).
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
  ): Promise<{ target: EntityTarget } | ReturnType<typeof errorResult>> {
    if (ref.kind !== undefined && ref.kind !== kind) {
      return errorResult(`This tool acts on a ${kind}, not a ${ref.kind}.`);
    }
    const { userId } = await mcpGetContext(ctx, clerkUserId);
    const resolved = await resolveEntityTarget(
      directId !== undefined
        ? { ...ref, id: directId, kind }
        : { ...ref, kind },
      userId,
    );
    if ("isError" in resolved) return resolved;
    if (resolved.target.kind !== kind) {
      return errorResult(
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
  function futureTime(iso: string): number | ReturnType<typeof errorResult> {
    const at = Date.parse(iso);
    if (at <= Date.now()) {
      return errorResult(`"${iso}" is not in the future. Pick a later time.`);
    }
    return at;
  }

  const projectInput = { projectId: projectIdArg, ...entityRefArgs };
  const taskInput = { taskId: taskIdArg, ...entityRefArgs };

  // ───────────────────────────────────────────────────────────────────────────
  // Project builds
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "start_project_build",
      description: `Start a project's build now — the "Start cooking" button. The build runs the project's tasks in dependency order, each as its own quick task.

Rejected when a build is already running. The reply only means the build workflow started; follow progress with get_agent_state (kind "project", "buildRunning") or list_entities. A pending scheduled build is left in place.`,
      mutating: true,
      input: projectInput,
      handler: async ({ projectId, ...ref }) => {
        const resolved = await resolveKind("project", projectId, ref);
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        await runMutation("buildWorkflow:startBuild", {
          projectId: target.targetId,
        });
        return textResult({ ...entitySummary(target), build: "started" });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "schedule_project_build",
      description: `Schedule a project's build to start at a future time. Use update_scheduled_project_build to move an existing schedule.

Rejected when a build is already running, when one is already scheduled, or when the time is not in the future. At the scheduled time the build is skipped if one is already running.`,
      mutating: true,
      input: { ...projectInput, scheduledAt: scheduledAtArg },
      handler: async ({ projectId, scheduledAt, ...ref }) => {
        const at = futureTime(scheduledAt);
        if (typeof at !== "number") return at;
        const resolved = await resolveKind("project", projectId, ref);
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        await runMutation("buildWorkflow:scheduleBuild", {
          projectId: target.targetId,
          scheduledAt: at,
        });
        return textResult({
          ...entitySummary(target),
          build: "scheduled",
          scheduledAt: new Date(at).toISOString(),
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "update_scheduled_project_build",
      description: `Move a project's scheduled build to a new future time. Any existing schedule is replaced; with none, this creates one. Rejected when the time is not in the future.`,
      mutating: true,
      input: { ...projectInput, scheduledAt: scheduledAtArg },
      handler: async ({ projectId, scheduledAt, ...ref }) => {
        const at = futureTime(scheduledAt);
        if (typeof at !== "number") return at;
        const resolved = await resolveKind("project", projectId, ref);
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        await runMutation("buildWorkflow:updateScheduledBuild", {
          projectId: target.targetId,
          scheduledAt: at,
        });
        return textResult({
          ...entitySummary(target),
          build: "rescheduled",
          scheduledAt: new Date(at).toISOString(),
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "cancel_scheduled_project_build",
      description: `Cancel a project's scheduled build before it starts. Does not touch a build that is already running (use cancel_project_build). Rejected when the project has no scheduled build.`,
      mutating: true,
      input: projectInput,
      handler: async ({ projectId, ...ref }) => {
        const resolved = await resolveKind("project", projectId, ref);
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        await runMutation("buildWorkflow:cancelScheduledBuild", {
          projectId: target.targetId,
        });
        return textResult({
          ...entitySummary(target),
          build: "schedule_cancelled",
        });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "cancel_project_build",
      description: `Stop a project's running build. Every in-progress task in the project is cancelled, its run marked as errored, and the task moved back to todo; finished tasks are left alone. Ask the user before calling — the in-flight work is lost.

Rejected when no build is running. This does not stop the project's sandbox chat (use stop_agent with kind "project").`,
      mutating: true,
      input: projectInput,
      handler: async ({ projectId, ...ref }) => {
        const resolved = await resolveKind("project", projectId, ref);
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        await runMutation("buildWorkflow:cancelBuild", {
          projectId: target.targetId,
        });
        return textResult({ ...entitySummary(target), build: "cancelled" });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Quick task lifecycle
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "update_task",
      description: `Edit a quick task's title, description, tags, priority or base branch. Only the fields you pass change.

Status and review state cannot be changed here; those stay a person's call. "tags" replaces the whole tag list. "priority": null clears it.`,
      mutating: true,
      input: {
        ...taskInput,
        title: z.string().min(1).optional().describe("New title."),
        description: z
          .string()
          .optional()
          .describe("New description (the task's prompt), as markdown."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Replacement tag list."),
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
        taskId,
        title,
        description,
        tags,
        priority,
        baseBranch,
        ...ref
      }) => {
        const updates: Record<string, JsonValue> = {};
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (tags !== undefined) updates.tags = tags;
        if (priority !== undefined) updates.priority = priority;
        if (baseBranch !== undefined) updates.baseBranch = baseBranch;
        if (Object.keys(updates).length === 0) {
          return errorResult(
            'Nothing to change: pass at least one of "title", "description", "tags", "priority" or "baseBranch".',
          );
        }
        const resolved = await resolveKind("task", taskId, ref);
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        await runMutation("agentTasks:update", {
          id: target.targetId,
          ...updates,
        });
        return textResult({
          ...entitySummary(target),
          updated: Object.keys(updates),
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
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        await runMutation("agentTasks:scheduleExecution", {
          id: target.targetId,
          scheduledAt: at,
        });
        return textResult({
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
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        await runMutation("agentTasks:updateScheduledExecution", {
          id: target.targetId,
          scheduledAt: at,
        });
        return textResult({
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
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        await runMutation("agentTasks:cancelScheduledExecution", {
          id: target.targetId,
        });
        return textResult({ ...entitySummary(target), run: "schedule_cancelled" });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "delete_task",
      description: `Delete a quick task (soft delete): it disappears from lists and its url. Ask the user in chat and get an explicit yes first.

Deleting also cancels its scheduled run, drops its run summary and queues its sandbox for deletion. restore_task brings the task row back, but none of those.`,
      mutating: true,
      input: { ...taskInput, confirmed: confirmedDeleteArg },
      // `confirmed` rides along in `ref`; the schema already required it.
      handler: async ({ taskId, ...ref }) => {
        const resolved = await resolveKind("task", taskId, ref);
        if ("isError" in resolved) return resolved;
        const { target } = resolved;
        await runMutation("agentTasks:remove", { id: target.targetId });
        return textResult({
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
        return textResult({ kind: "task", id: taskId, restored: true });
      },
    }),
  );

  return tools;
}
