import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { hasTeamAccess } from "../functions";

/**
 * Teammates of `userId`: every other member of every team they belong to.
 * Deduped, excluding the user themselves.
 */
export async function listTeammateUserIds(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
): Promise<Array<Id<"users">>> {
  const memberships = await db
    .query("teamMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const teammates = new Set<Id<"users">>();
  for (const membership of memberships) {
    const members = await db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", membership.teamId))
      .collect();
    for (const member of members) {
      if (member.userId !== userId) teammates.add(member.userId);
    }
  }
  return [...teammates];
}

/** True when both users belong to at least one team in common. */
export async function usersShareTeam(
  db: GenericDatabaseReader<DataModel>,
  a: Id<"users">,
  b: Id<"users">,
): Promise<boolean> {
  if (a === b) return true;
  const memberships = await db
    .query("teamMembers")
    .withIndex("by_user", (q) => q.eq("userId", a))
    .collect();
  for (const membership of memberships) {
    if (await hasTeamAccess(db, membership.teamId, b)) return true;
  }
  return false;
}

/**
 * Whether `ownerUserId` may run on this account: they own it, or the owner
 * shared it and the two are teammates. Usable never implies readable — only the
 * owner can reveal, edit, or delete the credentials.
 */
export async function isAccountUsableBy(
  db: GenericDatabaseReader<DataModel>,
  account: { userId: Id<"users">; shared?: boolean },
  ownerUserId: Id<"users">,
): Promise<boolean> {
  if (account.userId === ownerUserId) return true;
  if (account.shared !== true) return false;
  return await usersShareTeam(db, account.userId, ownerUserId);
}
