import { sessionActivityAt } from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";

/** The session fields the grouping reads. */
interface GroupableSession {
  _id: string;
  _creationTime: number;
  updatedAt?: number;
  title: string;
  /** Root session id of the linked-session group, when linked. */
  sessionGroupRootId?: string;
  /** Set when a repo sees the row only through a linked checkout. */
  linkedFrom?: object;
}

export interface LinkedSessionGroup<S, R> {
  rootId: string;
  /** The root session's title, or the oldest visible member's. */
  title: string;
  /** Root first, then by creation time. Each row carries the repo it came from. */
  members: Array<{ session: S; repo: R }>;
}

/**
 * Collects linked-session groups out of every app's session list. A group
 * needs two or more visible sessions; a lone survivor stays in its repo list.
 * A session listed by several apps (linked checkouts) appears once, under its
 * own repo when that list is loaded. Groups sort by latest activity.
 */
export function linkedSessionGroups<S extends GroupableSession, R>(
  lists: ReadonlyArray<{ repo: R; sessions: readonly S[] }>,
): Array<LinkedSessionGroup<S, R>> {
  const byRoot = new Map<string, Map<string, { session: S; repo: R }>>();
  for (const { repo, sessions } of lists) {
    for (const session of sessions) {
      const rootId = session.sessionGroupRootId;
      if (!rootId) continue;
      const members =
        byRoot.get(rootId) ?? new Map<string, { session: S; repo: R }>();
      byRoot.set(rootId, members);
      const seen = members.get(session._id);
      if (!seen || (seen.session.linkedFrom && !session.linkedFrom)) {
        members.set(session._id, { session, repo });
      }
    }
  }
  const groups: Array<LinkedSessionGroup<S, R> & { latestAt: number }> = [];
  for (const [rootId, byId] of byRoot) {
    if (byId.size < 2) continue;
    const members = [...byId.values()].toSorted(
      (a, b) =>
        Number(b.session._id === rootId) - Number(a.session._id === rootId) ||
        a.session._creationTime - b.session._creationTime,
    );
    groups.push({
      rootId,
      title: members[0].session.title,
      members,
      latestAt: Math.max(...members.map((m) => sessionActivityAt(m.session))),
    });
  }
  return groups
    .toSorted((a, b) => b.latestAt - a.latestAt)
    .map(({ rootId, title, members }) => ({ rootId, title, members }));
}
