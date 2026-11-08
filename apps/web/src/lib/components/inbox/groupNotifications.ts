import type { Id } from "@eva/backend";
import {
  groupNotifications as groupSharedNotifications,
  type NotificationGroup as SharedNotificationGroup,
} from "@eva/shared/notificationGroups";
import {
  getNotificationAppearance,
  type Notification,
} from "@/lib/components/notifications/notification-config";
import { repoDisplayLabel, type RepoWithLogo } from "@/lib/utils/repoGrouping";
import type { InboxGroup } from "@/lib/search-params";

export { OTHER_REPO_GROUP_LABEL, urgencyLabel } from "@eva/shared/notificationGroups";

/** Only the fields a repo label is built from, so callers can pass the full row. */
type RepoLabelFields = Pick<RepoWithLogo, "label" | "name" | "rootDirectory">;

export type NotificationGroup = SharedNotificationGroup<Notification>;

/**
 * The web inbox sections (`@eva/shared/notificationGroups`), with the web type
 * labels from the notification config and repo display labels.
 */
export function groupNotifications(
  notifications: Notification[],
  group: InboxGroup,
  repoById: ReadonlyMap<Id<"githubRepos">, RepoLabelFields>,
): NotificationGroup[] {
  return groupSharedNotifications(notifications, group, {
    typeLabel: (notification) => getNotificationAppearance(notification).label,
    repoLabel: (notification) => {
      const repo = notification.repoId ? repoById.get(notification.repoId) : undefined;
      return repo ? repoDisplayLabel(repo) : undefined;
    },
  });
}
