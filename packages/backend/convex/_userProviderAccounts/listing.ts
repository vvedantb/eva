import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { resolveUserDisplayFirstName } from "./defaults";
import { listTeammateUserIds } from "./sharing";
import { MASKED_ENV_VAR_VALUE } from "../_envVars/documentStore";

/**
 * Building the list of accounts a user may run on. Lives here rather than in
 * `userProviderAccounts.ts` because the plan-usage query needs exactly the same
 * list — a popover that listed a different set of credentials from the picker
 * would be showing headroom for accounts the user cannot spend.
 */

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
  const [ownName, rows] = await Promise.all([
    resolveUserDisplayFirstName(ctx.db, userId),
    ctx.db
      .query("userProviderAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  ]);
  const displayName = ownName ?? "Personal";
  // Teammates repeat across rows, so resolve each name once.
  const usedByIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.lastUsedByUserId && row.lastUsedByUserId !== userId
          ? [row.lastUsedByUserId]
          : [],
      ),
    ),
  ];
  const usedByNames = await Promise.all(
    usedByIds.map((id) => resolveUserDisplayFirstName(ctx.db, id)),
  );
  const names = new Map<Id<"users">, string | undefined>();
  usedByIds.forEach((id, i) => {
    names.set(id, usedByNames[i]);
  });
  const items = [];
  for (const row of rows) {
    const usedBy = row.lastUsedByUserId;
    items.push({
      _id: row._id,
      _creationTime: row._creationTime,
      provider: row.provider,
      label: displayName,
      credentials: row.credentials.map((entry) => ({
        key: entry.key,
        value: MASKED_ENV_VAR_VALUE,
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
  const [own, teammateRows] = await Promise.all([
    listAccountsFor(ctx, ownerUserId, true),
    listTeammateUserIds(ctx.db, ownerUserId).then((teammates) =>
      Promise.all(
        teammates.map((teammateId) => listAccountsFor(ctx, teammateId, false)),
      ),
    ),
  ]);
  const shared = teammateRows.flat().filter((row) => row.shared);
  return [...own, ...shared];
}
