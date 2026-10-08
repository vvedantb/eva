import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { resolveUserDisplayFirstName } from "./defaults";
import { listTeammateUserIds } from "./sharing";

/**
 * Building the list of accounts a user may run on. Lives here rather than in
 * `userProviderAccounts.ts` because the plan-usage query needs exactly the same
 * list — a popover that listed a different set of credentials from the picker
 * would be showing headroom for accounts the user cannot spend.
 */

/** The masked stand-in for a credential value. Never the real one. */
const MASKED_CREDENTIAL_VALUE = "••••••";

/**
 * One user's accounts with credential values masked, labelled with that user's
 * first name. Shared by every picker query so owner-scoped lists and the
 * viewer's own list cannot drift apart. `isOwn` says whether `userId` is the
 * owner of the pool being built, so callers can keep teammates' shared accounts
 * out of defaults.
 */
export async function listAccountsFor(
  ctx: QueryCtx,
  userId: Id<"users">,
  isOwn: boolean,
) {
  const displayName =
    (await resolveUserDisplayFirstName(ctx.db, userId)) ?? "Personal";
  const rows = await ctx.db
    .query("userProviderAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  // Teammates repeat across rows, so resolve each name once.
  const names = new Map<Id<"users">, string | undefined>();
  const items = [];
  for (const row of rows) {
    const usedBy = row.lastUsedByUserId;
    if (usedBy && usedBy !== userId && !names.has(usedBy)) {
      names.set(usedBy, await resolveUserDisplayFirstName(ctx.db, usedBy));
    }
    items.push({
      _id: row._id,
      _creationTime: row._creationTime,
      provider: row.provider,
      label: displayName,
      credentials: row.credentials.map((entry) => ({
        key: entry.key,
        value: MASKED_CREDENTIAL_VALUE,
      })),
      shared: row.shared === true,
      isOwn,
      lastUsedAt: row.lastUsedAt,
      lastUsedByName:
        usedBy && usedBy !== userId ? names.get(usedBy) : undefined,
      updatedAt: row.updatedAt,
    });
  }
  return items;
}

/**
 * The accounts `ownerUserId` may run on: their own, then every teammate's
 * shared accounts. Own accounts come first so nothing downstream prefers a
 * teammate's credential by accident.
 */
export async function listSelectableAccountsFor(
  ctx: QueryCtx,
  ownerUserId: Id<"users">,
) {
  const own = await listAccountsFor(ctx, ownerUserId, true);
  const teammates = await listTeammateUserIds(ctx.db, ownerUserId);
  const shared = [];
  for (const teammateId of teammates) {
    const rows = await listAccountsFor(ctx, teammateId, false);
    shared.push(...rows.filter((row) => row.shared));
  }
  return [...own, ...shared];
}
