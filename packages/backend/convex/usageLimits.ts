import { v, type Infer } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import { internalQuery, type QueryCtx } from "./_generated/server";
import {
  agentUsageLimitFields,
  PROVIDER_PRIMARY_AUTH_KEY,
  usageLimitProviderValidator,
} from "./validators";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { isAccountUsableBy } from "./_userProviderAccounts/sharing";
import { listSelectableAccountsFor } from "./_userProviderAccounts/listing";
import {
  findUsageLimitRow,
  listLegacyUsageLimitRows,
  parseUsageLimitRowKey,
  presentReading,
  usageLimitRowIdentity,
  type UsageLimitProvider,
  type UsageLimitRowKey,
} from "./_usageLimits/rows";
import {
  findRepoEnvVarDoc,
  findTeamEnvVarDoc,
} from "./_envVars/documentStore";

type UsageWindow = NonNullable<Doc<"agentUsageLimits">["windows"]>[number];

/** The stored discriminant. Derived from the row so the two cannot drift. */
export type UsageLimitCompleteness = NonNullable<
  Doc<"agentUsageLimits">["completeness"]
>;

const {
  repoId: _legacyRepoId,
  providerAccountId: _accountIsRowIdentity,
  teamId: _teamIsRowIdentity,
  ...usageLimitReadingFields
} = agentUsageLimitFields;

const USAGE_LIMIT_PROVIDER = usageLimitProviderValidator.value;

export function mergeUsageLimitWindows(
  stored: readonly UsageWindow[] | undefined,
  reported: readonly UsageWindow[] | undefined,
): UsageWindow[] | undefined {
  if (reported === undefined) return stored ? [...stored] : undefined;
  const byKey = new Map((stored ?? []).map((window) => [window.key, window]));
  for (const window of reported) byKey.set(window.key, window);
  return [...byKey.values()];
}

export function isAuthoritativeReading(
  completeness: UsageLimitCompleteness | undefined,
  snapshotComplete: boolean | undefined,
): boolean {
  if (completeness !== undefined) return completeness === "complete";
  return snapshotComplete === true;
}

async function resolveReportKey(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
  reported: {
    provider: UsageLimitProvider;
    providerAccountId?: Id<"userProviderAccounts">;
  },
): Promise<UsageLimitRowKey | null> {
  if (reported.providerAccountId !== undefined) {
    return {
      provider: reported.provider,
      providerAccountId: reported.providerAccountId,
    };
  }
  const repo = await db.get(repoId);
  const teamId = repo?.teamId;
  if (teamId === undefined) return null;
  return { provider: reported.provider, teamId };
}

/**
 * Upserts the reading for one credential. Authoritative provider snapshots
 * replace the row so vanished windows are cleared; partial stream observations
 * patch only what they actually observed.
 *
 * `repoId` stays a required argument because the sandbox callback bundle
 * (`callback-src/runtime/usageLimits.ts`) is a separate esbuild artifact that
 * cannot be redeployed in step with this mutation. It is used and then dropped:
 * it authorises the call, and for a run on the shared credential it names the
 * team whose token that was.
 */
export const report = authMutation({
  args: {
    ...usageLimitReadingFields,
    providerAccountId: agentUsageLimitFields.providerAccountId,
    repoId: v.id("githubRepos"),
    snapshotComplete: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { snapshotComplete, repoId, ...observed } = args;
    if (!(await hasRepoAccess(ctx.db, repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    if (observed.providerAccountId) {
      const account = await ctx.db.get(observed.providerAccountId);
      if (
        !account ||
        account.provider !== observed.provider ||
        !(await isAccountUsableBy(ctx.db, account, ctx.userId))
      ) {
        throw new Error("Provider account not found");
      }
    }
    const key = await resolveReportKey(ctx.db, repoId, observed);
    if (key === null) {
      console.log(
        `[usageLimits] dropped a team-credential reading for repo ${repoId}: no team`,
      );
      return null;
    }
    const existing = await findUsageLimitRow(ctx.db, key);
    for (const legacy of await listLegacyUsageLimitRows(ctx.db, key)) {
      await ctx.db.delete(legacy._id);
    }
    const reading = { ...observed, ...usageLimitRowIdentity(key) };
    if (existing) {
      if (isAuthoritativeReading(reading.completeness, snapshotComplete)) {
        await ctx.db.replace(existing._id, reading);
        return null;
      }
      const carriesReading =
        reading.windows !== undefined ||
        reading.status !== undefined ||
        reading.subscriptionType !== undefined ||
        reading.completeness !== undefined;
      if (!carriesReading) return null;
      await ctx.db.patch(existing._id, {
        capturedAt: reading.capturedAt,
        ...(reading.completeness === undefined
          ? {}
          : { completeness: reading.completeness }),
        ...(reading.subscriptionType === undefined
          ? {}
          : { subscriptionType: reading.subscriptionType }),
        ...(reading.status === undefined ? {} : { status: reading.status }),
        ...(reading.windows === undefined
          ? {}
          : {
              windows: mergeUsageLimitWindows(
                existing.windows,
                reading.windows,
              ),
            }),
      });
      return null;
    }
    await ctx.db.insert("agentUsageLimits", reading);
    return null;
  },
});

/**
 * The stored row for one credential, keyed by exactly one of account or team.
 * The refresh action reads it to carry the stored plan name forward: the probe
 * it runs reports numbers and never names the plan.
 */
export const getReadingInternal = internalQuery({
  args: {
    provider: usageLimitProviderValidator,
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    teamId: v.optional(v.id("teams")),
  },
  returns: v.union(
    v.null(),
    v.object({
      subscriptionType: v.optional(v.string()),
      capturedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const existing = await findUsageLimitRow(
      ctx.db,
      parseUsageLimitRowKey(args),
    );
    if (!existing) return null;
    return {
      capturedAt: existing.capturedAt,
      ...(existing.subscriptionType === undefined
        ? {}
        : { subscriptionType: existing.subscriptionType }),
    };
  },
});

const TEAM_CREDENTIAL_LABEL = "Team";

const usageLimitCredentialValidator = v.object({
  providerAccountId: v.optional(v.id("userProviderAccounts")),
  teamId: v.optional(v.id("teams")),
  accountLabel: v.string(),
});

type UsageLimitCredential = Infer<typeof usageLimitCredentialValidator>;

async function hasSharedClaudeCredential(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
  teamId: Id<"teams">,
): Promise<boolean> {
  const key = PROVIDER_PRIMARY_AUTH_KEY[USAGE_LIMIT_PROVIDER];
  const [teamVars, repoVars] = await Promise.all([
    findTeamEnvVarDoc(db, teamId),
    findRepoEnvVarDoc(db, repoId),
  ]);
  return [teamVars, repoVars].some(
    (row) => row?.vars.some((entry) => entry.key === key) === true,
  );
}

async function listUsageLimitCredentials(
  ctx: QueryCtx,
  userId: Id<"users">,
  repoId: Id<"githubRepos">,
): Promise<UsageLimitCredential[]> {
  const [accounts, repo] = await Promise.all([
    listSelectableAccountsFor(ctx, userId),
    ctx.db.get(repoId),
  ]);
  const credentials: UsageLimitCredential[] = accounts
    .filter((account) => account.provider === USAGE_LIMIT_PROVIDER)
    .map((account) => ({
      providerAccountId: account._id,
      accountLabel: account.label,
    }));
  const teamId = repo?.teamId;
  if (teamId === undefined) return credentials;
  if (!(await hasSharedClaudeCredential(ctx.db, repoId, teamId))) {
    return credentials;
  }
  return [...credentials, { teamId, accountLabel: TEAM_CREDENTIAL_LABEL }];
}

/**
 * Every Claude credential the viewer may run on, each with its current reading.
 *
 * The entries are the credentials, not the rows that happen to exist: a
 * connected account that has never reported still appears, with a null reading,
 * rather than vanishing from the card. And because a reading belongs to the
 * credential, the numbers no longer depend on which repo the card is open in.
 *
 * No row identity is returned. `_id`, the legacy `repoId` and `teamId` are the
 * table's business, and `accountLabel` is resolved on read rather than stored so
 * a rename shows up without rewriting rows.
 */
export const getForViewer = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    now: v.number(),
  },
  returns: v.array(
    v.object({
      providerAccountId: v.optional(v.id("userProviderAccounts")),
      accountLabel: v.string(),
      reading: v.union(v.null(), v.object(usageLimitReadingFields)),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const credentials = await listUsageLimitCredentials(
      ctx,
      ctx.userId,
      args.repoId,
    );
    return await Promise.all(
      credentials.map(async (credential) => {
        const row = await findUsageLimitRow(
          ctx.db,
          parseUsageLimitRowKey({
            provider: USAGE_LIMIT_PROVIDER,
            providerAccountId: credential.providerAccountId,
            teamId: credential.teamId,
          }),
        );
        return {
          ...(credential.providerAccountId === undefined
            ? {}
            : { providerAccountId: credential.providerAccountId }),
          accountLabel: credential.accountLabel,
          reading: presentReading(row, args.now),
        };
      }),
    );
  },
});

/**
 * The same credential list `getForViewer` shows, for the refresh action to fan
 * out over. Shared rather than rebuilt so the button cannot refresh a different
 * set of credentials from the one the card displays.
 */
export const listRefreshTargetsInternal = internalQuery({
  args: { userId: v.id("users"), repoId: v.id("githubRepos") },
  returns: v.array(usageLimitCredentialValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, args.userId))) return [];
    return await listUsageLimitCredentials(ctx, args.userId, args.repoId);
  },
});

/**
 * Daemon breadcrumb so a failed on-demand refresh shows up in Convex logs
 * instead of only `/tmp/callback-debug.log` on the VM.
 */
export const noteRefreshAttempt = authMutation({
  args: {
    captured: v.boolean(),
    available: v.optional(v.union(v.boolean(), v.null())),
    detail: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    console.log(
      `[usageLimits] daemon refresh captured=${args.captured} available=${String(args.available ?? "omitted")} ${args.detail}`,
    );
    return null;
  },
});
