import type { NeedsYouReason } from "./projectStatus";

/** The Needs you groups, in their on-screen order. */
export const NEEDS_YOU_GROUPS = [
  "question",
  "review",
  "triage",
  "failed",
] as const;
export type NeedsYouGroup = (typeof NEEDS_YOU_GROUPS)[number];

export const NEEDS_YOU_GROUP_LABELS: Record<NeedsYouGroup, string> = {
  question: "Questions",
  review: "To review",
  triage: "Triage",
  failed: "Failed",
};

/** Where a row comes from: its chip says so. */
export type NeedsYouSource = "project" | "quick_task" | "session";

/** A project child task's Needs you reason, as an Inbox group. The rest stay on the project. */
export function needsYouGroupForProjectTask(
  reason: NeedsYouReason | undefined,
): NeedsYouGroup | undefined {
  switch (reason) {
    case "question":
      return "question";
    case "review":
      return "review";
    case "approve":
      return "triage";
    case "failed":
      return "failed";
    default:
      return undefined;
  }
}

const QUICK_TASK_REVIEW_STATUSES: ReadonlySet<string> = new Set([
  "code_review",
  "business_review",
]);

/**
 * A quick task's Inbox group: its open (not draft) PR waits for review, or
 * its last run failed and nothing restarts it.
 */
export function needsYouGroupForQuickTask(task: {
  status: string;
  prState?: string;
  lastRunFailed: boolean;
}): NeedsYouGroup | undefined {
  if (task.prState === "open" && QUICK_TASK_REVIEW_STATUSES.has(task.status)) {
    return "review";
  }
  if (task.status === "todo" && task.lastRunFailed) return "failed";
  return undefined;
}

/** A standalone session's Inbox group: its open (not draft) PR waits for review. */
export function needsYouGroupForSession(session: {
  prState?: string;
}): NeedsYouGroup | undefined {
  return session.prState === "open" ? "review" : undefined;
}

/** The chip on a row: "Project · Checkout v2", "Quick task" or "Session". */
export function needsYouSourceLabel(row: {
  source: NeedsYouSource;
  projectTitle?: string;
}): string {
  if (row.source === "project") {
    return row.projectTitle ? `Project · ${row.projectTitle}` : "Project";
  }
  return row.source === "quick_task" ? "Quick task" : "Session";
}

/**
 * Rows by group, in group order, newest first inside a group. Empty groups
 * are left out.
 */
export function groupNeedsYou<Row extends { group: NeedsYouGroup; at: number }>(
  rows: readonly Row[],
): Array<{ group: NeedsYouGroup; label: string; rows: Row[] }> {
  return NEEDS_YOU_GROUPS.flatMap((group) => {
    const inGroup = rows
      .filter((row) => row.group === group)
      .sort((a, b) => b.at - a.at);
    return inGroup.length > 0
      ? [{ group, label: NEEDS_YOU_GROUP_LABELS[group], rows: inGroup }]
      : [];
  });
}
