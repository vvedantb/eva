import { sessionActivityAt } from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";

/** The session fields the grouping reads. */
interface GroupableSession {
  _id: string;
  _creationTime: number;
  updatedAt?: number;
  title: string;
  /** Linked-session group, when linked. */
  sessionGroupId?: string;
  /** The group's user-set name, when it has one. */
  sessionGroupName?: string;
  /** Set when a repo sees the row only through a linked checkout. */
  linkedFrom?: object;
}

export interface LinkedSessionGroup<S, R> {
  groupId: string;
  /** User-set name, when the group has one. */
  name?: string;
  /** What the sidebar shows: the name, or the oldest member's title. */
  label: string;
  /** Oldest first. Each row carries the repo it came from. */
  members: Array<{ session: S; repo: R }>;
}

/**
 * Collects linked-session groups out of every app's session list. Every
 * grouped row leaves its repo list, even when only one member is visible in
 * this list mode (a group always has two members; the other may be archived).
 * A session listed by several apps (linked checkouts) appears once, under its
 * own repo when that list is loaded. Groups sort by latest activity.
 */
export function linkedSessionGroups<S extends GroupableSession, R>(
  lists: ReadonlyArray<{ repo: R; sessions: readonly S[] }>,
): Array<LinkedSessionGroup<S, R>> {
  const byGroup = new Map<string, Map<string, { session: S; repo: R }>>();
  for (const { repo, sessions } of lists) {
    for (const session of sessions) {
      const groupId = session.sessionGroupId;
      if (!groupId) continue;
      const members =
        byGroup.get(groupId) ?? new Map<string, { session: S; repo: R }>();
      byGroup.set(groupId, members);
      const seen = members.get(session._id);
      if (!seen || (seen.session.linkedFrom && !session.linkedFrom)) {
        members.set(session._id, { session, repo });
      }
    }
  }
  const groups: Array<LinkedSessionGroup<S, R> & { latestAt: number }> = [];
  for (const [groupId, byId] of byGroup) {
    const members = [...byId.values()].toSorted(
      (a, b) => a.session._creationTime - b.session._creationTime,
    );
    const name = members[0].session.sessionGroupName;
    groups.push({
      groupId,
      name,
      label: name ?? members[0].session.title,
      members,
      latestAt: Math.max(...members.map((m) => sessionActivityAt(m.session))),
    });
  }
  return groups
    .toSorted((a, b) => b.latestAt - a.latestAt)
    .map(({ latestAt: _latestAt, ...group }) => group);
}
