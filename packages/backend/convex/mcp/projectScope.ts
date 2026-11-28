import { toolErrorResult } from "@vvedantb/server";
import type { EvaTool } from "./registry";

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

const COORDINATOR_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "update_project_summary",
  "retry_task",
  "start_task",
  "merge_task_into",
]);

const CHILD_ONLY_TOOLS: ReadonlySet<string> = new Set(["report_to_coordinator"]);

const CHILD_HIDDEN_TOOLS: ReadonlySet<string> = new Set([
  "create_tasks_batch",
  "stop_agent",
]);

const COORDINATOR_HIDDEN_TOOLS: ReadonlySet<string> = new Set([
  "create_and_run_task",
  "schedule_task",
  "update_scheduled_task",
]);

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
