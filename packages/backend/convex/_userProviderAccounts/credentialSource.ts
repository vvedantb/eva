import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { resolveUserDisplayFirstName } from "./defaults";
import { isAccountUsableBy } from "./sharing";

/** A chat message's snapshot of the credential that powered its turn. */
export type MessageCredential = {
  credentialSourceLabel: string;
  /** Absent = Team. Undefined (not omitted) so a patch clears a stale stamp. */
  credentialAccountId: Id<"userProviderAccounts"> | undefined;
};

const TEAM_CREDENTIAL: MessageCredential = {
  credentialSourceLabel: "Team",
  credentialAccountId: undefined,
};

/**
 * Snapshot label for which credential powered a run/turn.
 * Returns "Team" when no personal account was selected, the account is missing,
 * or (when ownerUserId is provided) that user cannot run on it. A teammate's
 * shared account labels as its owner's first name — that is who it bills to.
 */
export async function resolveCredentialSourceLabel(
  db: GenericDatabaseReader<DataModel>,
  providerAccountId: Id<"userProviderAccounts"> | undefined,
  ownerUserId?: Id<"users">,
): Promise<string> {
  const credential = await resolveMessageCredential(
    db,
    providerAccountId,
    ownerUserId,
  );
  return credential.credentialSourceLabel;
}

/**
 * The label plus the account id, for chat user messages. Spread into the row:
 * the id is what a usage-limit hold compares, since two accounts of one owner
 * share a label.
 */
export async function resolveMessageCredential(
  db: GenericDatabaseReader<DataModel>,
  providerAccountId: Id<"userProviderAccounts"> | undefined,
  ownerUserId?: Id<"users">,
): Promise<MessageCredential> {
  if (!providerAccountId) return TEAM_CREDENTIAL;
  const account = await db.get(providerAccountId);
  if (!account) return TEAM_CREDENTIAL;
  if (
    ownerUserId !== undefined &&
    !(await isAccountUsableBy(db, account, ownerUserId))
  )
    return TEAM_CREDENTIAL;
  const name = await resolveUserDisplayFirstName(db, account.userId);
  const legacy = account.label.trim();
  return {
    credentialSourceLabel: name || (legacy.length > 0 ? legacy : "Team"),
    credentialAccountId: providerAccountId,
  };
}
