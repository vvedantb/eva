/**
 * The cross-repo Sessions list, as pure data: the web sidebar
 * (`GlobalSessionsSidebar`) and the phone Sessions tab both order and group
 * the per-repo `sessions.list` / `sessions.listArchived` rows through it.
 */

export const APP_SORT_ORDERS = ["updated_at", "created_at", "manual"] as const;
export type AppSortOrder = (typeof APP_SORT_ORDERS)[number];

export const SESSION_SORT_ORDERS = ["updated_at", "created_at"] as const;
export type SessionSortOrder = (typeof SESSION_SORT_ORDERS)[number];

/** Activity timestamp for sidebar session rows. */
export function sessionActivityAt(session: {
  updatedAt?: number;
  _creationTime: number;
}): number {
  return session.updatedAt ?? session._creationTime;
}

/**
 * Orders a repo's sessions for any sidebar list. Every sidebar surface (global
 * list, chrome tabs, session switcher, the phone list) sorts through it.
 */
export function sortSessionsForSidebar<
  T extends { updatedAt?: number; _creationTime: number },
>(sessions: readonly T[], order: SessionSortOrder): T[] {
  if (order === "updated_at") {
    return sessions.toSorted(
      (a, b) => sessionActivityAt(b) - sessionActivityAt(a),
    );
  }
  return sessions.toSorted((a, b) => b._creationTime - a._creationTime);
}

export function sortAppsForSidebar<
  T extends { _id: string; _creationTime: number },
>(
  apps: T[],
  order: AppSortOrder,
  latestActivityByAppId: ReadonlyMap<string, number>,
): T[] {
  if (order === "manual") return apps;
  if (order === "created_at") {
    return apps.toSorted((a, b) => b._creationTime - a._creationTime);
  }
  return apps.toSorted((a, b) => {
    const aAt = latestActivityByAppId.get(a._id) ?? a._creationTime;
    const bAt = latestActivityByAppId.get(b._id) ?? b._creationTime;
    return bAt - aAt;
  });
}

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
  /** Creation time of the oldest member: the group's "Created at" sort key. */
  createdAt: number;
  /** Latest member activity: the group's "Last user message" sort key. */
  latestAt: number;
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
  const groups: Array<LinkedSessionGroup<S, R>> = [];
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
      createdAt: members[0].session._creationTime,
      latestAt: Math.max(...members.map((m) => sessionActivityAt(m.session))),
    });
  }
  return groups.toSorted((a, b) => b.latestAt - a.latestAt);
}

/** One top-level section of the Sessions list: a linked-session group or an app. */
export type SessionListEntry<S, R> =
  | {
      kind: "group";
      _id: string;
      _creationTime: number;
      group: LinkedSessionGroup<S, R>;
    }
  | {
      kind: "repo";
      _id: string;
      _creationTime: number;
      repo: R;
      /** The app's rows minus the ones its linked groups took; undefined while loading. */
      sessions: S[] | undefined;
    };

/**
 * The Sessions list's sections, in order. Linked sessions (one agent spun up
 * another) leave their repo lists for a cross-repo group of their own, in both
 * list modes. `order` sorts groups and apps as one list; each sorts by the rows
 * it shows, so an app does not rise on a linked session it gave away. Groups
 * go first, so "Manual" (which keeps input order) pins them on top.
 */
export function sessionListEntries<
  S extends GroupableSession,
  R extends { _id: string; _creationTime: number },
>(
  lists: ReadonlyArray<{ repo: R; sessions: readonly S[] | undefined }>,
  order: AppSortOrder,
): Array<SessionListEntry<S, R>> {
  const groups = linkedSessionGroups(
    lists.map(({ repo, sessions }) => ({ repo, sessions: sessions ?? [] })),
  );
  const linkedSessionIds = new Set<string>(
    groups.flatMap((group) =>
      group.members.map((member) => member.session._id),
    ),
  );
  const latestActivityById = new Map<string, number>();
  for (const group of groups) {
    latestActivityById.set(group.groupId, group.latestAt);
  }
  const repoEntries = lists.map(({ repo, sessions }): SessionListEntry<S, R> => {
    const own = sessions?.filter(
      (session) => !linkedSessionIds.has(session._id),
    );
    let latest = 0;
    for (const session of own ?? []) {
      latest = Math.max(latest, sessionActivityAt(session));
    }
    if (latest > 0) latestActivityById.set(repo._id, latest);
    return {
      kind: "repo",
      _id: repo._id,
      _creationTime: repo._creationTime,
      repo,
      sessions: own,
    };
  });
  return sortAppsForSidebar(
    [
      ...groups.map(
        (group): SessionListEntry<S, R> => ({
          kind: "group",
          _id: group.groupId,
          _creationTime: group.createdAt,
          group,
        }),
      ),
      ...repoEntries,
    ],
    order,
    latestActivityById,
  );
}

/**
 * A cache of `useQueries` request maps: one `query` per repo, keyed by
 * `{ repoId }`. `useQueries` resubscribes, and sets state in render, whenever
 * its argument changes identity. A render-local memo did not hold across
 * React's render-phase retry and looped ("Too many re-renders"), so the maps
 * are cached here by their value. Make one cache per call site.
 */
export function perRepoQueryCache<Q, RepoId extends string>() {
  const cache = new Map<
    string,
    Record<string, { query: Q; args: { repoId: RepoId } }>
  >();
  /** `queryKey` names `query` (say, the list mode) in the cache key. */
  return (
    query: Q,
    queryKey: string,
    repoIds: readonly RepoId[],
  ): Record<string, { query: Q; args: { repoId: RepoId } }> => {
    const key = `${queryKey}:${repoIds.join(",")}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const queries = Object.fromEntries(
      repoIds.map((repoId) => [repoId, { query, args: { repoId } }]),
    );
    cache.set(key, queries);
    return queries;
  };
}
