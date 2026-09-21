import dayjs from "@eva/shared/dates";
import type { Id } from "@eva/backend";
import {
  getNotificationAppearance,
  type Notification,
} from "@/lib/components/notifications/notification-config";
import { repoDisplayLabel, type RepoWithLogo } from "@/lib/utils/repoGrouping";
import type { InboxGroup } from "@/lib/search-params";

/** The bucket for notifications that belong to no repo (or an unknown one). */
export const OTHER_REPO_GROUP_LABEL = "Other";

/**
 * Delivery loudness, as a sort key. An unrouted mention (urgency undefined, so
 * routing has not landed yet) and every notification created before urgency
 * existed sort as `normal` — the same place the backend treats them.
 */
export const URGENCY_RANK = { high: 0, normal: 1, low: 2 } as const;

type Urgency = keyof typeof URGENCY_RANK;

function urgencyOf(notification: Notification): Urgency {
  return notification.urgency ?? "normal";
}

/**
 * The header a notification sits under when grouping by urgency. Named for
 * what the reader has to do, not for the enum: "high" says nothing about
 * whether it wants an answer.
 */
export function urgencyLabel(notification: Notification): string {
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
const URGENCY_LABEL_ORDER: readonly string[] = [
  "Needs reply",
  "FYI",
  "Low priority",
];

/** Only the fields a repo label is built from, so callers can pass the full row. */
type RepoLabelFields = Pick<RepoWithLogo, "label" | "name" | "rootDirectory">;

export interface NotificationGroup {
  label: string;
  items: Notification[];
}

/** Today / Yesterday / weekday / date, the way the inbox has always read. */
function dayLabel(createdAt: number): string {
  const at = dayjs(createdAt);
  const now = dayjs();
  if (at.isSame(now, "day")) return "Today";
  if (at.isSame(now.subtract(1, "day"), "day")) return "Yesterday";
  if (at.isSame(now, "week")) return at.format("dddd");
  return at.format("MMMM D, YYYY");
}

/**
 * Sections a notification list. `day` keeps the original date headers; `repo`
 * uses the repo's display label ("Other" for notifications with no repo);
 * `type` uses the type's human label from the notification config, so a row
 * reads the same in its header as it does in the trailing status column; and
 * `urgency` splits on what the reader has to do about it.
 *
 * Group order follows first appearance, and the list arrives newest-first, so
 * every mode is ordered by its most recent item — except `urgency`, whose
 * sections are fixed in rank order because "Low priority" above "Needs reply"
 * would defeat the point of the grouping.
 *
 * Within every section, items are sorted by urgency and otherwise left in the
 * order they arrived: a mention that wants an answer should lead its day, not
 * sit below three incidental ones that happen to be newer. Pure — the list
 * component owns nothing but the rendering.
 */
export function groupNotifications(
  notifications: Notification[],
  group: InboxGroup,
  repoById: ReadonlyMap<Id<"githubRepos">, RepoLabelFields>,
): NotificationGroup[] {
  const labelOf = (notification: Notification): string => {
    if (group === "day") return dayLabel(notification.createdAt);
    if (group === "type") return getNotificationAppearance(notification).label;
    if (group === "urgency") return urgencyLabel(notification);
    const repo = notification.repoId
      ? repoById.get(notification.repoId)
      : undefined;
    return repo ? repoDisplayLabel(repo) : OTHER_REPO_GROUP_LABEL;
  };

  const groups: NotificationGroup[] = [];
  const byLabel = new Map<string, NotificationGroup>();
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

  // `toSorted` is stable, so an equal-urgency pair keeps the newest-first order
  // it arrived in.
  const ordered = groups.map((bucket) => ({
    label: bucket.label,
    items: bucket.items.toSorted(
      (a, b) => URGENCY_RANK[urgencyOf(a)] - URGENCY_RANK[urgencyOf(b)],
    ),
  }));
  if (group !== "urgency") return ordered;
  return ordered.toSorted(
    (a, b) =>
      URGENCY_LABEL_ORDER.indexOf(a.label) -
      URGENCY_LABEL_ORDER.indexOf(b.label),
  );
}
