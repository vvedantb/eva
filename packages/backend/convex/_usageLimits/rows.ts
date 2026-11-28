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
 * The one row for `key`, or null when the credential has never reported.
 */
export async function findUsageLimitRow(
  db: GenericDatabaseReader<DataModel>,
  key: UsageLimitRowKey,
): Promise<Doc<"agentUsageLimits"> | null> {
  if (key.providerAccountId === undefined) {
    return await db
      .query("agentUsageLimits")
      .withIndex("by_provider_team", (q) =>
        q.eq("provider", key.provider).eq("teamId", key.teamId),
      )
      .first();
  }
  return await db
    .query("agentUsageLimits")
    .withIndex("by_provider_account", (q) =>
      q
        .eq("provider", key.provider)
        .eq("providerAccountId", key.providerAccountId),
    )
    .first();
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
      if (reportedWindows.length > 0) {
        delete next.status;
        delete next.completeness;
      }
    }
  }
  return next;
}
