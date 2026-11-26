import type { Doc } from "@eva/backend";

// A project's status is derived, never stored: it is read from its child
// tasks and their PRs. Web, phone and the backend scheduler share these rules.

type TaskStatus = Doc<"agentTasks">["status"];
type PrState = NonNullable<Doc<"agentTasks">["prState"]>;

/** What the stage rule reads of a task. */
export interface TaskStageFacts {
  status: TaskStatus;
  /** The task's PR summary state; undefined when it has no PR. */
  prState?: PrState;
}

/** One child task, as the status and scheduling rules read it. */
export interface ProjectTaskFacts extends TaskStageFacts {
  id: string;
  taskNumber?: number;
  /**
   * The task may run (`agentTasks.approvedAt`): every project task is
   * approved at creation (people's asks are handed to the coordinator).
   */
  approved: boolean;
  /**
   * The task was handed to the coordinator
   * (`agentTasks.handedToCoordinatorAt`) and it has not started: only the
   * coordinator starts it (or adds it to an open task), never the scheduler.
   */
  withCoordinator?: boolean;
  /**
   * The latest run ended and nothing restarts it by itself: it failed, or a
   * person cancelled it. A usage-limit stop is `usageLimited` instead.
   */
  halted?: "failed" | "cancelled";
  /** The latest run hit the usage limit on the account the project still uses. */
  usageLimited: boolean;
  /** A run is queued, running, scheduled or waiting to retry. */
  runPending: boolean;
  /**
   * Restarts the coordinator spent on this task (`agentTasks.coordinatorRetries`).
   * Absent reads as 0.
   */
  coordinatorRetries?: number;
  /**
   * The task's open ask (`report_to_coordinator` with `kind: "ask"`), by who
   * must answer it now: the coordinator, or a person once the coordinator had
   * its turn without answering (or its wake-ups are paused). Absent when no
   * ask is open.
   */
  openAsk?: "coordinator" | "person";
}

/** Where a task stands for the people who read the project. */
export type ProjectTaskStage =
  | "launched"
  | "in_review"
  | "in_progress"
  | "todo"
  | "cancelled";

/** Where the project as a whole stands. */
export type ProjectStage = "done" | "in_progress" | "todo";

/** Why a task waits for a person. */
export type NeedsYouReason =
  | "usage_limit"
  | "failed"
  | "stopped"
  | "pr_closed"
  | "review"
  | "question";

/**
 * A task's stage. `done` is launched only once its PR merged (or when it has
 * no PR); a done task with a PR still open or closed is in review.
 */
export function projectTaskStage(task: TaskStageFacts): ProjectTaskStage {
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

/**
 * The coordinator may restart a failed task this many times (decision 17).
 * After that a failure waits for a person.
 */
export const MAX_COORDINATOR_RETRIES = 1;

/**
 * Why the task waits for a person, or undefined when it does not. A first
 * failure is the coordinator's to handle (it may retry once); only a failure
 * after that retry needs a person. An open ask needs a person only once the
 * coordinator passed on it.
 */
export function projectTaskNeedsYou(
  task: ProjectTaskFacts,
): NeedsYouReason | undefined {
  if (task.status === "cancelled") return undefined;
  if (task.usageLimited) return "usage_limit";
  if (task.openAsk === "person") return "question";
  if (task.halted === "failed") {
    return (task.coordinatorRetries ?? 0) >= MAX_COORDINATOR_RETRIES
      ? "failed"
      : undefined;
  }
  if (task.halted === "cancelled") return "stopped";
  if (task.prState === "closed") return "pr_closed";
  if (task.status === "todo" || task.status === "draft") return undefined;
  // Review needs the task's own open PR. A task from before the coordinator
  // can sit in review with no PR (its work went into the project's PR):
  // there is nothing for a person to review there.
  return projectTaskStage(task) === "in_review" && task.prState === "open"
    ? "review"
    : undefined;
}

/**
 * True while the task waits for its coordinator: it asked a question and
 * stopped its turn. It stays `in_progress` and keeps its parallel slot.
 */
export function projectTaskWaitsForCoordinator(task: ProjectTaskFacts): boolean {
  return task.status !== "cancelled" && task.openAsk === "coordinator";
}

/**
 * How a project's child task shows in its task list, by who must act: the
 * agent (`working`), a person or the coordinator (`blocked`, shown as "Needs
 * you"), nobody yet (`idle`: waiting for a free slot or with the
 * coordinator), or no one any more (`archived`).
 * The project itself keeps its stages (`projectStatus`), and counts its
 * tasks by these statuses.
 */
export type ProjectTaskDisplayStatus =
  | "working"
  | "blocked"
  | "idle"
  | "archived";

/**
 * A child task's display status. Archived: launched or cancelled. Blocked
 * (shown as "Needs you"):
 * waits for a person (`projectTaskNeedsYou`), for its coordinator (an open
 * ask, or a first failure it may retry), is halted, or is in review.
 * Working: in progress. Idle: a todo task nothing holds back, or one handed
 * to the coordinator that it has not placed yet.
 */
export function projectTaskDisplayStatus(
  task: ProjectTaskFacts,
): ProjectTaskDisplayStatus {
  const stage = projectTaskStage(task);
  if (stage === "launched" || stage === "cancelled") return "archived";
  if (
    stage === "in_review" ||
    task.halted !== undefined ||
    task.openAsk !== undefined ||
    projectTaskNeedsYou(task) !== undefined
  ) {
    return "blocked";
  }
  return stage === "in_progress" ? "working" : "idle";
}

export interface ProjectStatus {
  stage: ProjectStage;
  /** The project's tasks by display status (`projectTaskDisplayStatus`). */
  counts: Record<ProjectTaskDisplayStatus, number>;
  needsYou: Array<{ id: string; reason: NeedsYouReason }>;
}

/**
 * The project's stage, its task counts by display status, and the tasks that
 * wait for a person. Done: at least one task, and every task is launched or
 * cancelled. To Do: no task has started (every task is still todo, or there
 * are none). In Progress: anything else.
 */
export function projectStatus(
  tasks: readonly ProjectTaskFacts[],
): ProjectStatus {
  const counts: Record<ProjectTaskDisplayStatus, number> = {
    working: 0,
    blocked: 0,
    idle: 0,
    archived: 0,
  };
  const needsYou: ProjectStatus["needsYou"] = [];
  let finished = 0;
  let notStarted = 0;
  for (const task of tasks) {
    counts[projectTaskDisplayStatus(task)] += 1;
    const stage = projectTaskStage(task);
    if (stage === "launched" || stage === "cancelled") finished += 1;
    if (stage === "todo") notStarted += 1;
    const reason = projectTaskNeedsYou(task);
    if (reason !== undefined) needsYou.push({ id: task.id, reason });
  }
  const stage: ProjectStage =
    notStarted === tasks.length
      ? "todo"
      : finished === tasks.length
        ? "done"
        : "in_progress";
  return { stage, counts, needsYou };
}

/**
 * The tasks the scheduler starts now, in `taskNumber` order: every approved
 * `todo` task with no run pending and not halted, except the ones handed to
 * the coordinator (it starts those itself). No cap on how many run at
 * once (add one only when usage shows a need). Nothing starts while the
 * project's account is at its usage limit.
 */
export function tasksToStart(tasks: readonly ProjectTaskFacts[]): string[] {
  if (tasks.some((task) => task.usageLimited)) return [];
  return tasks
    .filter(
      (task) =>
        task.status === "todo" &&
        task.approved &&
        task.withCoordinator !== true &&
        task.halted === undefined &&
        !task.runPending,
    )
    .sort((a, b) => (a.taskNumber ?? 0) - (b.taskNumber ?? 0))
    .map((task) => task.id);
}
