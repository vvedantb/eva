import { toolErrorResult } from "@vvedantb/server";
import type { EvaTool } from "./registry";

/**
 * Who an MCP caller speaks for inside a project (decision 14, the hub
 * model). Resolved once for each request from the sandbox token's chat
 * (`mcp.queries.resolveCallerOwner`, which reads `chatOwner`):
 *
 *   coordinator  the Main chat of a project's own session
 *   child        a chat or run of a task that belongs to a project
 *
 * Any other caller (a session, a quick task, an OAuth client, Manager Ave)
 * is not a project caller and keeps today's tools unchanged.
 *
 * Pure, so the permission matrix is tested without a server.
 */

/** The task or project a sandbox chat speaks for (`chatOwner`). */
export type McpCallerOwner =
  | { kind: "project"; projectId: string }
  | { kind: "task"; taskId: string; projectId?: string };

export type ProjectCaller =
  | { role: "coordinator"; projectId: string }
  | { role: "child"; projectId: string; taskId: string };

export function projectCallerOf(
  owner: McpCallerOwner | undefined,
): ProjectCaller | undefined {
  if (owner === undefined) return undefined;
  if (owner.kind === "project") {
    return { role: "coordinator", projectId: owner.projectId };
  }
  return owner.projectId === undefined
    ? undefined
    : { role: "child", projectId: owner.projectId, taskId: owner.taskId };
}

/** Tools only a coordinator gets. */
const COORDINATOR_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "update_project_summary",
  "retry_task",
  "start_task",
  "merge_task_into",
]);

/** Tools only a child task gets. */
const CHILD_ONLY_TOOLS: ReadonlySet<string> = new Set(["report_to_coordinator"]);

/**
 * Tools a child task never gets: it cannot create tasks in batches or stop
 * an agent.
 */
const CHILD_HIDDEN_TOOLS: ReadonlySet<string> = new Set([
  "create_tasks_batch",
  "stop_agent",
]);

/**
 * Tools a coordinator never gets: its tasks start through the scheduler
 * (all of them, in task-number order), so no direct
 * run or schedule.
 */
const COORDINATOR_HIDDEN_TOOLS: ReadonlySet<string> = new Set([
  "create_and_run_task",
  "schedule_task",
  "update_scheduled_task",
]);

/** Session-only tools a project chat refuses with a clear error. */
const SESSION_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "update_plan",
  "mark_plan_implemented",
]);

export type ToolAccess =
  | { kind: "allow" }
  | { kind: "hide" }
  | { kind: "refuse"; message: string };

/** What one caller may do with one tool, by name. */
export function projectToolAccess(
  caller: ProjectCaller | undefined,
  toolName: string,
): ToolAccess {
  const role = caller?.role;
  if (COORDINATOR_ONLY_TOOLS.has(toolName) && role !== "coordinator") {
    return { kind: "hide" };
  }
  if (CHILD_ONLY_TOOLS.has(toolName) && role !== "child") {
    return { kind: "hide" };
  }
  if (role === "child" && CHILD_HIDDEN_TOOLS.has(toolName)) {
    return { kind: "hide" };
  }
  if (role === "coordinator" && COORDINATOR_HIDDEN_TOOLS.has(toolName)) {
    return { kind: "hide" };
  }
  if (role !== undefined && SESSION_ONLY_TOOLS.has(toolName)) {
    return {
      kind: "refuse",
      message:
        "This is a project chat. Plans live in the project summary (update_project_summary) and in tasks, not in a session Plan tab.",
    };
  }
  return { kind: "allow" };
}

/** The same tool, answering every call with `message`. */
function refusingTool(tool: EvaTool, message: string): EvaTool {
  const refuse = async () => toolErrorResult(message);
  return {
    ...tool,
    registerFlat: (server) => {
      server.tool(tool.name, tool.description, tool.inputShape, refuse);
    },
    invoke: refuse,
  };
}

/** Applies `projectToolAccess` to a whole tool list. */
export function applyProjectToolPolicy(
  tools: readonly EvaTool[],
  caller: ProjectCaller | undefined,
): EvaTool[] {
  return tools.flatMap((tool) => {
    const access = projectToolAccess(caller, tool.name);
    if (access.kind === "hide") return [];
    if (access.kind === "refuse") return [refusingTool(tool, access.message)];
    return [tool];
  });
}

/** What a target check reads of a resolved chat. */
export interface ProjectTargetFacts {
  kind: "session" | "task" | "project";
  targetId: string;
  /** The project the target belongs to: a project's own id, a task's project. */
  projectId?: string;
}

/**
 * Why `caller` may not change `target`, or null when it may. Reads are
 * always allowed (a child task reads its siblings, decision 14). A child
 * task changes only itself and work outside its project: never a sibling or
 * its project. A coordinator changes only its own project and its tasks.
 */
export function projectTargetRefusal(
  caller: ProjectCaller | undefined,
  target: ProjectTargetFacts,
  intent: "read" | "write",
): string | null {
  if (caller === undefined || intent === "read") return null;
  if (caller.role === "child") {
    if (target.kind === "task" && target.targetId === caller.taskId) {
      return null;
    }
    return target.projectId === caller.projectId
      ? "A project task cannot change its sibling tasks or its project. Tell the coordinator with report_to_coordinator."
      : null;
  }
  return target.projectId === caller.projectId
    ? null
    : "The project coordinator acts only on its own project and its tasks.";
}
