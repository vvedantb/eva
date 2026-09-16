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
 * uses the repo's display label ("Other" for notifications with no repo); and
 * `type` uses the type's human label from the notification config, so a row
 * reads the same in its header as it does in the trailing status column.
 *
 * Group order follows first appearance, and the list arrives newest-first, so
 * every mode is ordered by its most recent item. Pure — the list component
 * owns nothing but the rendering.
 */
export function groupNotifications(
  notifications: Notification[],
  group: InboxGroup,
  repoById: ReadonlyMap<Id<"githubRepos">, RepoLabelFields>,
): NotificationGroup[] {
  const labelOf = (notification: Notification): string => {
    if (group === "day") return dayLabel(notification.createdAt);
    if (group === "type") return getNotificationAppearance(notification).label;
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
  return groups;
}
