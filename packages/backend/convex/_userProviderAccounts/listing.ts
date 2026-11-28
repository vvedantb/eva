import type { ProjectAccount } from "../_projects/projectAccount";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { resolveUserDisplayFirstName } from "./defaults";
import { listTeammateUserIds } from "./sharing";

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
  const [ownName, rows] = await Promise.all([
    resolveUserDisplayFirstName(ctx.db, userId),
    ctx.db
      .query("userProviderAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  ]);
  const displayName = ownName ?? "Personal";
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

type AccountListItem = Awaited<ReturnType<typeof listAccountsFor>>[number];

/**
 * A project's account is the one Eva's chat runs on, held by the project's
 * owner (`_projects/projectAccount.ts`), so a picker in its chats lists it
 * first, even when the pool owner (a child task's creator) could not pick
 * it. Unchanged without a project account.
 */
export async function withProjectAccountFirst(
  ctx: QueryCtx,
  rows: AccountListItem[],
  project: ProjectAccount | null,
): Promise<AccountListItem[]> {
  const accountId = project?.providerAccountId;
  if (!project || accountId === undefined) return rows;
  const row =
    rows.find((item) => item._id === accountId) ??
    (await listAccountsFor(ctx, project.userId, false)).find(
      (item) => item._id === accountId,
    );
  if (!row) return rows;
  return [row, ...rows.filter((item) => item._id !== accountId)];
}
