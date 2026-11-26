/**
 * A project's 30-day progress chart, shared by the backend
 * (`projects.progressChart`) and both apps. Pure.
 */

/** How many days the chart shows, today included. */
export const PROJECT_PROGRESS_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the chart needs of a task: when it opened, shipped and closed. */
export type ProgressTask<Id extends string = string> = {
  id: Id;
  createdAt: number;
  /** Its PR merged, or it was marked Done. */
  shippedAt?: number;
  /** It left the open list: shipped, archived or cancelled. */
  closedAt?: number;
};

export type ProgressDay<Id extends string = string> = {
  /** The day's local midnight, as a timestamp. */
  start: number;
  /** Tasks that shipped this day. */
  shipped: Id[];
  /** Tasks that closed this day without shipping (archived or cancelled). */
  archived: Id[];
  /** Tasks still open at the end of the day (now, for today). */
  open: number;
};

export type ProjectProgress<Id extends string = string> = {
  days: ProgressDay<Id>[];
  totals: { shipped: number; archived: number; open: number };
};

/**
 * The chart's days, oldest first, in the reader's local days.
 * `tzOffsetMinutes` is `Date.getTimezoneOffset()` (minutes west of UTC).
 */
export function bucketProjectProgress<Id extends string>(
  tasks: ReadonlyArray<ProgressTask<Id>>,
  now: number,
  tzOffsetMinutes: number,
  dayCount: number = PROJECT_PROGRESS_DAYS,
): ProjectProgress<Id> {
  const offsetMs = tzOffsetMinutes * 60 * 1000;
  const dayIndex = (at: number) => Math.floor((at - offsetMs) / DAY_MS);
  const today = dayIndex(now);
  const first = today - (dayCount - 1);
  const days: ProgressDay<Id>[] = Array.from({ length: dayCount }, (_, i) => ({
    start: (first + i) * DAY_MS + offsetMs,
    shipped: [],
    archived: [],
    open: 0,
  }));
  const dayOf = (at: number | undefined) => {
    if (at === undefined) return undefined;
    const index = dayIndex(at) - first;
    return index >= 0 && index < dayCount ? days[index] : undefined;
  };
  for (const task of tasks) {
    if (task.shippedAt !== undefined) {
      dayOf(task.shippedAt)?.shipped.push(task.id);
    } else {
      dayOf(task.closedAt)?.archived.push(task.id);
    }
  }
  for (const day of days) {
    const end = Math.min(day.start + DAY_MS, now);
    day.open = tasks.filter(
      (task) =>
        task.createdAt < end &&
        (task.closedAt === undefined || task.closedAt >= end),
    ).length;
  }
  return {
    days,
    totals: {
      shipped: days.reduce((sum, day) => sum + day.shipped.length, 0),
      archived: days.reduce((sum, day) => sum + day.archived.length, 0),
      open: days[days.length - 1]?.open ?? 0,
    },
  };
}

/** A task the chart names: its number and title. */
export type ProgressTaskName<Id extends string = string> = {
  id: Id;
  numId?: number;
  title: string;
};

/**
 * What a picked day lists, both apps: the tasks that shipped and the ones
 * archived that day, by name, and how many were open at its end.
 */
export function progressDayDetail<Id extends string>(
  day: ProgressDay<Id>,
  tasks: ReadonlyArray<ProgressTaskName<Id>>,
): {
  shipped: ProgressTaskName<Id>[];
  archived: ProgressTaskName<Id>[];
  open: number;
} {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const named = (ids: Id[]) =>
    ids.flatMap((id) => {
      const task = byId.get(id);
      return task ? [task] : [];
    });
  return { shipped: named(day.shipped), archived: named(day.archived), open: day.open };
}
