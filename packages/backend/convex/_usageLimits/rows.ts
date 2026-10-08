import type { GenericDatabaseReader } from "convex/server";
import type { Infer } from "convex/values";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { usageLimitProviderValidator } from "../validators";

/**
 * Row identity for `agentUsageLimits`, and the read-time trimming every reader
 * owes a stored row.
 *
 * A reading measures a *credential's* plan, not a repo's: the same connected
 * account has the same headroom whichever repo it runs on. So a row is keyed by
 * the credential — the connected account, or, for the shared
 * `CLAUDE_CODE_OAUTH_TOKEN` from team/repo env vars, the team that owns it.
 *
 * Rows written while the key still included the repo keep their `repoId`, and
 * they share the `by_provider_account` index range with the account rows that
 * replaced them. Every lookup therefore drops them in JS. The set is tiny (one
 * row per repo the account ever ran on) and `report` deletes the ones it walks
 * past, so the range drains itself within a day — the same day the 24h
 * freshness window stops honouring them anyway.
 *
 * That filter lives here and nowhere else: a reader that forgot it would start
 * showing a per-repo number again, which is the bug this keying replaced.
 */

export type UsageLimitProvider = Infer<typeof usageLimitProviderValidator>;

/**
 * Which credential a reading belongs to. Exactly one of the two: an account row
 * carries `providerAccountId`, a team row carries `teamId`, and neither carries
 * a repo.
 */
export type UsageLimitRowKey =
  | {
      provider: UsageLimitProvider;
      providerAccountId: Id<"userProviderAccounts">;
      teamId?: never;
    }
  | {
      provider: UsageLimitProvider;
      teamId: Id<"teams">;
      providerAccountId?: never;
    };

/**
 * Builds a key from the loose shape callers hold (both ids optional, because
 * that is how they arrive over the wire) and rejects anything that names both
 * credentials or neither — an ambiguous key would silently read one row and
 * write another.
 */
export function parseUsageLimitRowKey(input: {
  provider: UsageLimitProvider;
  providerAccountId?: Id<"userProviderAccounts">;
  teamId?: Id<"teams">;
}): UsageLimitRowKey {
  if (input.providerAccountId !== undefined && input.teamId === undefined) {
    return {
      provider: input.provider,
      providerAccountId: input.providerAccountId,
    };
  }
  if (input.teamId !== undefined && input.providerAccountId === undefined) {
    return { provider: input.provider, teamId: input.teamId };
  }
  throw new Error(
    "A usage limit row is keyed by exactly one of providerAccountId or teamId",
  );
}

/** The identity fields a stored row carries for `key`, and nothing else. */
export function usageLimitRowIdentity(
  key: UsageLimitRowKey,
):
  | { providerAccountId: Id<"userProviderAccounts"> }
  | { teamId: Id<"teams"> } {
  return key.providerAccountId === undefined
    ? { teamId: key.teamId }
    : { providerAccountId: key.providerAccountId };
}

/** Readings older than this are no longer evidence of the provider's state. */
export const USAGE_LIMIT_READING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isUsageLimitReadingFresh(
  capturedAt: number,
  now: number,
): boolean {
  return now - capturedAt <= USAGE_LIMIT_READING_MAX_AGE_MS;
}

/**
 * The credential-keyed row in an index range that still holds legacy per-repo
 * rows, and its counterpart. Pure, and generic over the id type so plain
 * strings stand in for the `Id<"githubRepos">` a real row carries: the rule they
 * encode — a row with a `repoId` is a different question's answer — is worth
 * testing without a database.
 */
export function pickCanonicalRow<T extends { repoId?: string }>(
  rows: readonly T[],
): T | null {
  return rows.find((row) => row.repoId === undefined) ?? null;
}

export function pickLegacyRows<T extends { repoId?: string }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => row.repoId !== undefined);
}

/**
 * The one canonical row for `key`, or null when the credential has never
 * reported.
 */
export async function findUsageLimitRow(
  db: GenericDatabaseReader<DataModel>,
  key: UsageLimitRowKey,
): Promise<Doc<"agentUsageLimits"> | null> {
  if (key.providerAccountId === undefined) {
    // Legacy rows never set `teamId`, so this range holds only new team rows
    // and needs no filtering.
    return await db
      .query("agentUsageLimits")
      .withIndex("by_provider_team", (q) =>
        q.eq("provider", key.provider).eq("teamId", key.teamId),
      )
      .first();
  }
  return pickCanonicalRow(
    await accountRangeRows(db, key.provider, key.providerAccountId),
  );
}

/**
 * The rows for `key` that still carry a `repoId`. `report` deletes these as it
 * upserts, which is the only cleanup this migration gets — a one-off script
 * would have to race the daemon still writing rows.
 */
export async function listLegacyUsageLimitRows(
  db: GenericDatabaseReader<DataModel>,
  key: UsageLimitRowKey,
): Promise<Array<Doc<"agentUsageLimits">>> {
  // A team row's legacy ancestors reported no account either, so they sit in
  // the same `providerAccountId: undefined` slot of the account range — for
  // every team, since a legacy row names a repo and not a team. Sweeping them
  // all is fine: nothing reads a legacy row any more, whoever it belonged to.
  return pickLegacyRows(
    await accountRangeRows(db, key.provider, key.providerAccountId),
  );
}

async function accountRangeRows(
  db: GenericDatabaseReader<DataModel>,
  provider: UsageLimitProvider,
  providerAccountId: Id<"userProviderAccounts"> | undefined,
): Promise<Array<Doc<"agentUsageLimits">>> {
  return await db
    .query("agentUsageLimits")
    .withIndex("by_provider_account", (q) =>
      q.eq("provider", provider).eq("providerAccountId", providerAccountId),
    )
    .collect();
}

/**
 * The reading a client may see, or null when there is nothing current to show.
 * Derived from the row rather than restated so a schema change lands here, and
 * carries no row identity: which credential it belongs to is the caller's
 * question, already answered by the key it looked the row up with.
 */
export type PresentedUsageReading = Pick<
  Doc<"agentUsageLimits">,
  | "provider"
  | "capturedAt"
  | "subscriptionType"
  | "status"
  | "windows"
  | "completeness"
>;

/**
 * Trims a stored row down to what is still true at `now`: a stale row is no
 * reading at all, and a window that has reset is not headroom anyone spent.
 */
export function presentReading(
  row: PresentedUsageReading | null,
  now: number,
): PresentedUsageReading | null {
  if (row === null) return null;
  if (!isUsageLimitReadingFresh(row.capturedAt, now)) return null;
  const next: PresentedUsageReading = {
    provider: row.provider,
    capturedAt: row.capturedAt,
    ...(row.subscriptionType === undefined
      ? {}
      : { subscriptionType: row.subscriptionType }),
    ...(row.status === undefined ? {} : { status: row.status }),
    ...(row.windows === undefined ? {} : { windows: row.windows }),
    ...(row.completeness === undefined
      ? {}
      : { completeness: row.completeness }),
  };
  const reportedWindows = next.windows;
  if (reportedWindows) {
    const activeWindows = reportedWindows.filter(
      (window) => window.resetsAt === undefined || window.resetsAt > now,
    );
    if (activeWindows.length > 0) {
      next.windows = activeWindows;
    } else {
      delete next.windows;
      // A status observed alongside windows expires when all of those windows
      // reset. Windowless status-only events remain until the row's captured-at
      // freshness limit above.
      //
      // The discriminant goes with it: "complete" described a reading whose
      // windows have all since reset, and leaving it would have the UI report
      // that the provider has no plan windows at all. A reading that never
      // carried windows keeps it — that is the case it exists for.
      if (reportedWindows.length > 0) {
        delete next.status;
        delete next.completeness;
      }
    }
  }
  return next;
}
