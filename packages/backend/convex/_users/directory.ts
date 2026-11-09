import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";

/**
 * Assignee/name directory: the caller plus everyone on their teams.
 * `listAll` used to `collect()` the whole users table.
 */
export function collectDirectoryUserIds<TUserId>(
  self: TUserId,
  members: ReadonlyArray<{ userId: TUserId }>,
): TUserId[] {
  const ids = new Set<TUserId>([self]);
  for (const member of members) {
    ids.add(member.userId);
  }
  return [...ids];
}

/**
 * True when `targetId` is the caller or shares a team with them: the people
 * whose email and current page the caller may see. One indexed lookup per
 * caller team, no scan of the target's teams.
 */
export async function isDirectoryPeer(
  db: GenericDatabaseReader<DataModel>,
  callerId: Id<"users">,
  targetId: Id<"users">,
): Promise<boolean> {
  if (callerId === targetId) return true;
  const memberships = await db
    .query("teamMembers")
    .withIndex("by_user", (q) => q.eq("userId", callerId))
    .collect();
  const shared = await Promise.all(
    memberships.map((membership) =>
      db
        .query("teamMembers")
        .withIndex("by_team_and_user", (q) =>
          q.eq("teamId", membership.teamId).eq("userId", targetId),
        )
        .first(),
    ),
  );
  return shared.some((row) => row !== null);
}
