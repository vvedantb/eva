import type { Doc } from "@eva/backend";

// A project's status is derived, never stored: it is read from its child
// tasks and their PRs. Web, phone and the backend scheduler share these rules.

/** At most this many child tasks of one project are `in_progress` at once. */
export const MAX_PARALLEL_PROJECT_TASKS = 3;

type TaskStatus = Doc<"agentTasks">["status"];
type PrState = NonNullable<Doc<"agentTasks">["prState"]>;

/** What a dependency rule reads of a task. */
export interface DependencyFacts {
  status: TaskStatus;
  /** The task's PR summary state; undefined when it has no PR. */
  prState?: PrState;
}

/** One child task, as the status and scheduling rules read it. */
export interface ProjectTaskFacts extends DependencyFacts {
  id: string;
  taskNumber?: number;
  /** A person approved the task (`agentTasks.approvedAt`). */
  approved: boolean;
  /**
   * The latest run ended and nothing restarts it by itself: it failed, or a
   * person cancelled it. A usage-limit stop is `usageLimited` instead.
   */
  halted?: "failed" | "cancelled";
  /** The latest run hit the usage limit on the account the project still uses. */
  usageLimited: boolean;
  /** A run is queued, running, scheduled or waiting to retry. */
  runPending: boolean;
  /** The tasks this task depends on. A deleted dependency is left out. */
  dependencies: readonly DependencyFacts[];
}

/** Where a task stands for the people who read the project. */
export type ProjectTaskStage =
  | "launched"
  | "in_review"
  | "in_progress"
  | "todo"
  | "cancelled";

/** Where the project as a whole stands. */
export type ProjectStage = "done" | "in_review" | "in_progress" | "todo";

/** Why a task waits for a person. */
export type NeedsYouReason =
  | "usage_limit"
  | "failed"
  | "stopped"
  | "pr_closed"
  | "approve"
  | "dependency_cancelled"
  | "review";

/**
 * A task's stage. `done` is launched only once its PR merged (or when it has
 * no PR); a done task with a PR still open or closed is in review.
 */
export function projectTaskStage(task: DependencyFacts): ProjectTaskStage {
  switch (task.status) {
    case "done":
      return task.prState === undefined || task.prState === "merged"
        ? "launched"
        : "in_review";
    case "code_review":
    case "business_review":
      return "in_review";
    case "in_progress":
      return "in_progress";
    case "cancelled":
      return "cancelled";
    case "todo":
    case "draft":
      return "todo";
  }
}

/** A dependency lets its dependents start once it is launched: done and merged. */
export function isDependencyMet(dependency: DependencyFacts): boolean {
  return projectTaskStage(dependency) === "launched";
}

/** Why the task waits for a person, or undefined when it does not. */
export function projectTaskNeedsYou(
  task: ProjectTaskFacts,
): NeedsYouReason | undefined {
  if (task.status === "cancelled") return undefined;
  if (task.usageLimited) return "usage_limit";
  if (task.halted === "failed") return "failed";
  if (task.halted === "cancelled") return "stopped";
  if (task.prState === "closed") return "pr_closed";
  if (task.status === "todo" || task.status === "draft") {
    if (!task.approved) return "approve";
    if (task.dependencies.some((dep) => dep.status === "cancelled")) {
      return "dependency_cancelled";
    }
    return undefined;
  }
  return projectTaskStage(task) === "in_review" ? "review" : undefined;
}

export interface ProjectStatus {
  stage: ProjectStage;
  counts: Record<ProjectTaskStage, number>;
  needsYou: Array<{ id: string; reason: NeedsYouReason }>;
}

/**
 * The project's stage: done when every task is launched or cancelled, todo
 * when it has no tasks, else the most active stage any task is in.
 */
export function projectStatus(
  tasks: readonly ProjectTaskFacts[],
): ProjectStatus {
  const counts: Record<ProjectTaskStage, number> = {
    launched: 0,
    in_review: 0,
    in_progress: 0,
    todo: 0,
    cancelled: 0,
  };
  const needsYou: ProjectStatus["needsYou"] = [];
  for (const task of tasks) {
    counts[projectTaskStage(task)] += 1;
    const reason = projectTaskNeedsYou(task);
    if (reason !== undefined) needsYou.push({ id: task.id, reason });
  }
  const finished = counts.launched + counts.cancelled;
  const stage: ProjectStage =
    tasks.length > 0 && finished === tasks.length
      ? "done"
      : counts.in_progress > 0
        ? "in_progress"
        : counts.in_review > 0
          ? "in_review"
          : "todo";
  return { stage, counts, needsYou };
}

/**
 * The tasks the scheduler starts now, in `taskNumber` order: approved `todo`
 * tasks with no run pending, not halted, whose dependencies are all met, up
 * to `MAX_PARALLEL_PROJECT_TASKS` in progress. Nothing starts while the
 * project's account is at its usage limit.
 */
export function tasksToStart(tasks: readonly ProjectTaskFacts[]): string[] {
  if (tasks.some((task) => task.usageLimited)) return [];
  const inProgress = tasks.filter(
    (task) => task.status === "in_progress",
  ).length;
  const slots = MAX_PARALLEL_PROJECT_TASKS - inProgress;
  if (slots <= 0) return [];
  return tasks
    .filter(
      (task) =>
        task.status === "todo" &&
        task.approved &&
        task.halted === undefined &&
        !task.runPending &&
        task.dependencies.every(isDependencyMet),
    )
    .sort((a, b) => (a.taskNumber ?? 0) - (b.taskNumber ?? 0))
    .slice(0, slots)
    .map((task) => task.id);
}

/**
 * True when the dependency edges (task id → the id it depends on) form a
 * cycle, so no task in it could ever start.
 */
export function hasDependencyCycle(
  edges: ReadonlyArray<readonly [string, string]>,
): boolean {
  const next = new Map<string, string[]>();
  for (const [from, to] of edges) {
    next.set(from, [...(next.get(from) ?? []), to]);
  }
  const done = new Set<string>();
  const onPath = new Set<string>();
  const visit = (id: string): boolean => {
    if (onPath.has(id)) return true;
    if (done.has(id)) return false;
    onPath.add(id);
    const cyclic = (next.get(id) ?? []).some(visit);
    onPath.delete(id);
    done.add(id);
    return cyclic;
  };
  return [...next.keys()].some(visit);
}
