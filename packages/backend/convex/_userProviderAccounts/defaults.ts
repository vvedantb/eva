import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { getAIModelProvider } from "../validators";
import { isAccountUsableBy } from "./sharing";

/**
 * Picks the creator's own account for `model`'s provider (most recently updated
 * wins), or undefined for Team when none match. Deliberately never considers a
 * teammate's shared account: those bill to their owner, so they are explicit
 * picks only.
 */
export async function resolveDefaultProviderAccountId(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  model: string | undefined,
): Promise<Id<"userProviderAccounts"> | undefined> {
  const provider = getAIModelProvider(model);
  const accounts = await db
    .query("userProviderAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  let best: (typeof accounts)[number] | undefined;
  for (const account of accounts) {
    if (account.provider !== provider) continue;
    if (!best || account.updatedAt > best.updatedAt) best = account;
  }
  return best?._id;
}

/**
 * Validates that `providerAccountId` is either unset or usable by
 * `ownerUserId` — owned by them, or shared with them by a teammate. Returns the
 * id to store, or undefined for Team.
 */
export async function assertProviderAccountUsableBy(
  db: GenericDatabaseReader<DataModel>,
  providerAccountId: Id<"userProviderAccounts"> | null | undefined,
  ownerUserId: Id<"users">,
): Promise<Id<"userProviderAccounts"> | undefined> {
  if (providerAccountId === null || providerAccountId === undefined) {
    return undefined;
  }
  const account = await db.get(providerAccountId);
  if (!account || !(await isAccountUsableBy(db, account, ownerUserId))) {
    throw new Error("Provider account not found");
  }
  return providerAccountId;
}

type TurnProviderAccountBase = {
  requestedAccountId: Id<"userProviderAccounts"> | undefined;
  ownerUserId: Id<"users">;
  model: string | undefined;
};

async function reconcileUsableAccountForModel(
  db: GenericDatabaseReader<DataModel>,
  ownerUserId: Id<"users">,
  model: string | undefined,
  accountId: Id<"userProviderAccounts"> | undefined,
): Promise<Id<"userProviderAccounts"> | undefined> {
  if (accountId === undefined) return undefined;
  return await reconcileProviderAccountForModel(
    db,
    ownerUserId,
    model,
    accountId,
  );
}

/**
 * Resolves the account a chat turn should run on. Project and task chat are
 * owner-sticky: only the owner may point the turn at a different account.
 * Session chat lets anyone with access pick from the owner's pool. Both then
 * reconcile the provider, so switching model provider never throws — an
 * automatic reconcile is not a collaborator changing the billed account.
 */
export async function resolveTurnProviderAccountId(
  db: GenericDatabaseReader<DataModel>,
  args:
    | (TurnProviderAccountBase & {
        changePolicy: "owner-only";
        currentAccountId: Id<"userProviderAccounts"> | undefined;
        senderUserId: Id<"users">;
        ownerNoun: "project owner" | "task owner";
      })
    | (TurnProviderAccountBase & {
        changePolicy: "owner-pool";
      }),
): Promise<Id<"userProviderAccounts"> | undefined> {
  if (args.changePolicy === "owner-only") {
    const requested = args.requestedAccountId;
    if (requested === undefined) {
      return await reconcileUsableAccountForModel(
        db,
        args.ownerUserId,
        args.model,
        args.currentAccountId,
      );
    }
    if (
      args.senderUserId !== args.ownerUserId &&
      requested !== args.currentAccountId
    ) {
      throw new Error(
        `Only the ${args.ownerNoun} can change the provider account`,
      );
    }
    const accountId = await assertProviderAccountUsableBy(
      db,
      requested,
      args.ownerUserId,
    );
    return await reconcileUsableAccountForModel(
      db,
      args.ownerUserId,
      args.model,
      accountId,
    );
  }

  const accountId = await assertProviderAccountUsableBy(
    db,
    args.requestedAccountId,
    args.ownerUserId,
  );
  return await reconcileUsableAccountForModel(
    db,
    args.ownerUserId,
    args.model,
    accountId,
  );
}

/**
 * When the model provider changes, keep the current account only if it still
 * matches; otherwise fall back to the owner's default for the new provider.
 */
export async function reconcileProviderAccountForModel(
  db: GenericDatabaseReader<DataModel>,
  ownerUserId: Id<"users">,
  model: string | undefined,
  currentAccountId: Id<"userProviderAccounts"> | undefined,
): Promise<Id<"userProviderAccounts"> | undefined> {
  if (currentAccountId) {
    const account = await db.get(currentAccountId);
    if (
      account &&
      account.provider === getAIModelProvider(model) &&
      (await isAccountUsableBy(db, account, ownerUserId))
    ) {
      return currentAccountId;
    }
  }
  return await resolveDefaultProviderAccountId(db, ownerUserId, model);
}

/** Display name for credential badges: first name, then full name. */
export async function resolveUserDisplayFirstName(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
): Promise<string | undefined> {
  const user = await db.get(userId);
  if (!user) return undefined;
  const first = user.firstName?.trim();
  if (first) return first;
  const full = user.fullName?.trim();
  return full && full.length > 0 ? full : undefined;
}
