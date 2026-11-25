import { toolErrorResult, toolJsonResult } from "@vvedantb/server";
import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { guarded, mcpGetContext, type McpCredentials } from "./toolShared";
import { defineTool, type EvaTool } from "./registry";
import { projectCallerOf, type ProjectCaller } from "./projectScope";

/**
 * Names one task of the caller's project: its Convex id, or its number in the
 * project ("#3" → 3). Shared by the project-aware task tools.
 */
export const projectTaskRefArgs = {
  taskId: z
    .string()
    .optional()
    .describe("The task's Convex id. Or name it with taskNumber."),
  taskNumber: z
    .number()
    .int()
    .optional()
    .describe(
      'The task\'s number in this project (3 for "#3"). Project chats only.',
    ),
};

/**
 * Resolves `taskId` / `taskNumber` to a task id inside the caller's project.
 * A bare `taskId` passes through (the tool's own checks apply to it).
 */
export async function resolveProjectTaskRef(
  ctx: ActionCtx,
  caller: ProjectCaller | undefined,
  ref: { taskId?: string; taskNumber?: number },
): Promise<string | ReturnType<typeof toolErrorResult> | undefined> {
  if (ref.taskId !== undefined) return ref.taskId;
  if (ref.taskNumber === undefined) return undefined;
  if (caller === undefined) {
    return toolErrorResult(
      "taskNumber works only in a project chat. Pass taskId instead.",
    );
  }
  const taskId = await ctx.runQuery(
    internal.mcp.projectQueries.projectTaskByNumber,
    { projectId: caller.projectId, taskNumber: ref.taskNumber },
  );
  return (
    taskId ?? toolErrorResult(`This project has no task #${ref.taskNumber}.`)
  );
}

/**
 * A child task never changes a sibling's or its project's doc or artifact
 * (decision 14). Null when the caller may write the row.
 */
export async function siblingRowRefusal(
  ctx: ActionCtx,
  caller: ProjectCaller | undefined,
  table: "docs" | "artifacts",
  id: string,
): Promise<ReturnType<typeof toolErrorResult> | null> {
  if (caller?.role !== "child") return null;
  const scope = await ctx.runQuery(internal.mcp.projectQueries.rowSourceScope, {
    table,
    id,
  });
  const own = scope.taskId !== undefined && scope.taskId === caller.taskId;
  if (own || scope.projectId !== caller.projectId) return null;
  return toolErrorResult(
    "A project task cannot change a sibling's or the project's docs and artifacts. Tell the coordinator with report_to_coordinator.",
  );
}

/**
 * Tools that exist only inside a project (`projectToolAccess` hides each
 * from every other caller): the coordinator's summary and retry, and a child
 * task's report up to its coordinator.
 */
export function projectTools(
  credentials: McpCredentials,
  ctx: ActionCtx,
): EvaTool[] {
  const caller = projectCallerOf(credentials.owner);
  if (caller === undefined) return [];
  const { clerkUserId } = credentials;
  const tools: EvaTool[] = [];

  tools.push(
    defineTool({
      name: "update_project_summary",
      description: `Replace this project's summary document (the ledger people read) with new markdown. Coordinator only. Pass the whole text, not a diff. Use these sections: Goal, Launched, In progress, Next, Decisions, Risks. Do not write task counts: the project shows live counts above the summary.`,
      mutating: true,
      input: {
        markdown: z.string().describe("The full summary as markdown."),
      },
      handler: async ({ markdown }) =>
        guarded(async () => {
          if (caller.role !== "coordinator") {
            return toolErrorResult("Only the project coordinator keeps the summary.");
          }
          const { userId } = await mcpGetContext(ctx, clerkUserId);
          const docId = await ctx.runMutation(
            internal.mcp.projectQueries.updateProjectSummary,
            { projectId: caller.projectId, userId, markdown },
          );
          return toolJsonResult({ docId, status: "updated" });
        }),
    }),
  );

  tools.push(
    defineTool({
      name: "retry_task",
      description: `Restart one failed task of this project, once (coordinator only). Pass a note on what went wrong and what to change; the retried run reads it. The run continues on the task's own branch. A task can be retried by the coordinator only once: after a second failure a person decides.`,
      mutating: true,
      input: {
        ...projectTaskRefArgs,
        note: z
          .string()
          .min(1)
          .describe("What went wrong and what the retry should do differently."),
      },
      handler: async ({ note, ...ref }) =>
        guarded(async () => {
          if (caller.role !== "coordinator") {
            return toolErrorResult("Only the project coordinator retries tasks.");
          }
          const taskId = await resolveProjectTaskRef(ctx, caller, ref);
          if (taskId === undefined) {
            return toolErrorResult("Name the task with taskId or taskNumber.");
          }
          if (typeof taskId !== "string") return taskId;
          await ctx.runMutation(
            internal.buildWorkflow.retryFailedTaskAsCoordinator,
            { projectId: caller.projectId, taskId, note },
          );
          return toolJsonResult({ taskId, status: "retry_started" });
        }),
    }),
  );

  tools.push(
    defineTool({
      name: "report_to_coordinator",
      description: `Send a message up to this project's coordinator (project tasks only). Both kinds show on your task's row in the coordinator chat.
- kind "report": a finding other tasks need (for example "the API shape changed") or a status note. Keep working after it; it does not wake the coordinator.
- kind "ask": a question or blocker you cannot solve. It wakes the coordinator at once. After an ask, STOP: end your turn now and do not commit partial work. The answer starts your next run. Only one ask can be open at a time.`,
      mutating: true,
      input: {
        kind: z.enum(["report", "ask"]).describe('"report" or "ask".'),
        text: z.string().min(1).describe("The report or the question."),
      },
      handler: async ({ kind, text }) =>
        guarded(async () => {
          if (caller.role !== "child") {
            return toolErrorResult("Only a project's task reports to its coordinator.");
          }
          await mcpGetContext(ctx, clerkUserId);
          const reportId = await ctx.runMutation(
            internal._projects.reports.fileReportFromTask,
            { taskId: caller.taskId, kind, text },
          );
          return toolJsonResult({
            reportId,
            kind,
            status: "sent",
            ...(kind === "ask"
              ? {
                  next: "End your turn now. Your task waits for the answer, which starts your next run.",
                }
              : {}),
          });
        }),
    }),
  );

  return tools;
}
