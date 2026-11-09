import { formatDayLabel } from "./utils/dayLabel";

/**
 * Inbox sectioning shared by the web and mobile inboxes. Pure: the caller
 * supplies the type label (its notification config) and the repo label.
 */

/** How the inbox sections notifications (the web `inboxGroups`). */
export type InboxGroup = "day" | "repo" | "type" | "urgency";

/** The bucket for notifications that belong to no repo (or an unknown one). */
export const OTHER_REPO_GROUP_LABEL = "Other";

type Urgency = "high" | "normal" | "low";

/** The fields grouping reads. */
export type GroupableNotification = { createdAt: number; urgency?: Urgency };

/**
 * Delivery loudness, as a sort key. An unrouted mention (urgency undefined, so
 * routing has not landed yet) and every notification created before urgency
 * existed sort as `normal` — the same place the backend treats them.
 */
const URGENCY_RANK = { high: 0, normal: 1, low: 2 } as const;

function urgencyOf(notification: GroupableNotification): Urgency {
  return notification.urgency ?? "normal";
}

/**
 * The header a notification sits under when grouping by urgency. Named for
 * what the reader has to do, not for the enum: "high" says nothing about
 * whether it wants an answer.
 */
export function urgencyLabel(notification: GroupableNotification): string {
  switch (urgencyOf(notification)) {
    case "high":
      return "Needs reply";
    case "normal":
      return "FYI";
    case "low":
      return "Low priority";
  }
}

/** Sections in rank order, so "Needs reply" always leads the list. */
const URGENCY_LABEL_ORDER: readonly string[] = ["Needs reply", "FYI", "Low priority"];

export interface NotificationGroup<N> {
  label: string;
  items: N[];
}

/**
 * Sections a notification list. `day` keeps the date headers; `repo` uses the
 * repo label ("Other" with none); `type` uses the caller's type label, so a
 * header reads like the row's status glyph; `urgency` splits on what the
 * reader has to do about it.
 *
 * Group order follows first appearance and the list arrives newest-first, so
 * every mode is ordered by its newest item, except `urgency`, whose sections
 * are fixed in rank order. Within a section, items sort by urgency and keep
 * arrival order otherwise.
 */
export function groupNotifications<N extends GroupableNotification>(
  notifications: ReadonlyArray<N>,
  group: InboxGroup,
  labels: { typeLabel: (notification: N) => string; repoLabel: (notification: N) => string | undefined },
): NotificationGroup<N>[] {
  const labelOf = (notification: N): string => {
    if (group === "day") return formatDayLabel(notification.createdAt);
    if (group === "type") return labels.typeLabel(notification);
    if (group === "urgency") return urgencyLabel(notification);
    return labels.repoLabel(notification) ?? OTHER_REPO_GROUP_LABEL;
  };
  const groups: NotificationGroup<N>[] = [];
  const byLabel = new Map<string, NotificationGroup<N>>();
  for (const notification of notifications) {
    const label = labelOf(notification);
    let bucket = byLabel.get(label);
    if (!bucket) {
      bucket = { label, items: [] };
      byLabel.set(label, bucket);
      groups.push(bucket);
    }
    bucket.items.push(notification);
  }
  // `toSorted` is stable, so an equal-urgency pair keeps the newest-first order it arrived in.
  const ordered = groups.map((bucket) => ({
    label: bucket.label,
    items: bucket.items.toSorted((a, b) => URGENCY_RANK[urgencyOf(a)] - URGENCY_RANK[urgencyOf(b)]),
  }));
  if (group !== "urgency") return ordered;
  return ordered.toSorted((a, b) => URGENCY_LABEL_ORDER.indexOf(a.label) - URGENCY_LABEL_ORDER.indexOf(b.label));
}
