/** One row of the agent's task list: the activity trace's todo item. */
export interface ComposerTaskStep {
  readonly content: string;
  readonly status: "pending" | "in_progress" | "completed";
}

/** The first to-do snapshot in a parsed activity payload, or none. */
export function composerTaskSteps(
  steps:
    | readonly { readonly type: string; readonly todos?: readonly ComposerTaskStep[] }[]
    | null
    | undefined,
): readonly ComposerTaskStep[] {
  return steps?.find((step) => step.type === "todos")?.todos ?? [];
}

/** Step names repeat across a task list, so keys need an occurrence suffix. */
export function keyedComposerTaskSteps<Step extends ComposerTaskStep>(
  steps: readonly Step[],
): { key: string; step: Step }[] {
  const occurrences = new Map<string, number>();
  return steps.map((step) => {
    const occurrence = occurrences.get(step.content) ?? 0;
    occurrences.set(step.content, occurrence + 1);
    return { key: `${step.content}:${occurrence}`, step };
  });
}

export interface ComposerTaskProgress {
  step: string;
  completedSteps: number;
  totalSteps: number;
  allDone: boolean;
}

/** The panel's headline, or null when there is no list to show. */
export function composerTaskProgress(
  steps: readonly ComposerTaskStep[],
): ComposerTaskProgress | null {
  const [first] = steps;
  if (!first) return null;
  const completed = steps.filter((step) => step.status === "completed");
  const current =
    steps.find((step) => step.status === "in_progress") ??
    completed.at(-1) ??
    first;
  return {
    step: current.content,
    completedSteps: completed.length,
    totalSteps: steps.length,
    allDone: completed.length === steps.length,
  };
}

/** The collapsed panel's accessible label. */
export function composerTasksLabel(progress: ComposerTaskProgress): string {
  return `Tasks: ${progress.completedSteps} of ${progress.totalSteps} complete. Current task: ${progress.step}`;
}

export const COMPOSER_TASKS_TITLE = "Tasks";
export const COMPOSER_TASKS_DISMISS_LABEL = "Dismiss tasks for this turn";
/** The in-progress row's trailing word. */
export const COMPOSER_TASK_NOW = "now";
