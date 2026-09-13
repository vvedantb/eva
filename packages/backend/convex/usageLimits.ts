import { v, type Infer } from "convex/values";
import {
  isSandboxIdentity,
  rejectSandboxCaller,
  requireSandboxCaller,
} from "./_auth/sandboxIdentity";
import type { GenericDatabaseReader } from "convex/server";
import {
  authMutation,
  authQuery,
  hasRepoAccess,
  hasSessionAccess,
  hasTaskAccess,
} from "./functions";
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
  ensureSessionDaemonState,
  syncSessionDaemonState,
} from "./_sessions/daemonState";

/**
 * Agent plan usage limits. A sandbox turn captures how much of the provider's
 * plan it has used and reports it here; the UI reads it back per credential.
 *
 * Deliberately its own mutation rather than extra completion arguments: the
 * completion mutation is shared by every entity workflow, and a reading that is
 * pure telemetry has no business widening that contract.
 *
 * Auth mirrors the completion mutations — the sandbox calls in with its
 * CONVEX_TOKEN identity (the launching user), so repo access is checked exactly
 * as `sessionWorkflow:handleCompletion` checks it.
 *
 * The repo the reading arrived on authorises the call and names the team behind
 * the shared credential, and is then dropped: see `_usageLimits/rows.ts` for why
 * a row belongs to a credential.
 */

type UsageWindow = NonNullable<Doc<"agentUsageLimits">["windows"]>[number];

/** The stored discriminant. Derived from the row so the two cannot drift. */
export type UsageLimitCompleteness = NonNullable<
  Doc<"agentUsageLimits">["completeness"]
>;

/**
 * The reading itself, with every field that is row identity rather than reading
 * removed: which credential a reading belongs to is the caller's own question,
 * and the legacy `repoId` is nobody's. Taken apart from the schema fields rather
 * than restated, so a new reading field reaches the wire on its own.
 */
const {
  repoId: _legacyRepoId,
  providerAccountId: _accountIsRowIdentity,
  teamId: _teamIsRowIdentity,
  ...usageLimitReadingFields
} = agentUsageLimitFields;

/** The only provider with plan windows, so the only one with credentials here. */
const USAGE_LIMIT_PROVIDER = usageLimitProviderValidator.value;

/** New same-key windows win while unobserved stored windows remain intact. */
export function mergeUsageLimitWindows(
  stored: readonly UsageWindow[] | undefined,
  reported: readonly UsageWindow[] | undefined,
): UsageWindow[] | undefined {
  if (reported === undefined) return stored ? [...stored] : undefined;
  const byKey = new Map((stored ?? []).map((window) => [window.key, window]));
  for (const window of reported) byKey.set(window.key, window);
  return [...byKey.values()];
}

/**
 * Whether a reading may replace the stored row wholesale. Only a complete
 * provider response may: everything else has seen part of the picture, so it is
 * merged. `snapshotComplete` is the pre-discriminant wire form of the same
 * question, honoured for callback bundles that predate `completeness`.
 */
export function isAuthoritativeReading(
  completeness: UsageLimitCompleteness | undefined,
  snapshotComplete: boolean | undefined,
): boolean {
  if (completeness !== undefined) return completeness === "complete";
  return snapshotComplete === true;
}

/**
 * Which credential a report belongs to. An account names itself; a run on the
 * shared credential names only the repo it ran in, so the team that owns the
 * token is resolved here. Null when that repo belongs to no team.
 */
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
    // Required on the wire even though the stored field is optional: every
    // caller reports from a repo, and only a legacy row keeps one. `teamId` is
    // not accepted at all — a sandbox does not get to choose whose plan its
    // reading is filed against.
    repoId: v.id("githubRepos"),
    /** Superseded by `completeness`. Callback bundles baked before the
     * discriminant still send this boolean, so it is still honoured; bundles
     * that send neither safely receive merge semantics. */
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
    // A run on the shared credential in a repo with no team has nowhere to file
    // its reading: the row is keyed by team. Dropping it is right — telemetry
    // must not fail a turn, and there is no viewer who could read it back.
    if (key === null) {
      console.log(
        `[usageLimits] dropped a team-credential reading for repo ${repoId}: no team`,
      );
      return null;
    }
    const existing = await findUsageLimitRow(ctx.db, key);
    // Self-cleaning: the rows this key used to have one of per repo are dead
    // weight the moment a credential-keyed row exists, and this is the only
    // writer that knows the key is current.
    for (const legacy of await listLegacyUsageLimitRows(ctx.db, key)) {
      await ctx.db.delete(legacy._id);
    }
    const reading = { ...observed, ...usageLimitRowIdentity(key) };
    if (existing) {
      if (isAuthoritativeReading(reading.completeness, snapshotComplete)) {
        await ctx.db.replace(existing._id, reading);
        return null;
      }
      // A partial report that observed nothing is not evidence of anything —
      // re-stamping `capturedAt` for it would keep presenting hours-old numbers
      // as "updated 1m ago" forever. Only a report that actually carries a
      // reading moves the clock.
      const carriesReading =
        reading.windows !== undefined ||
        reading.status !== undefined ||
        reading.subscriptionType !== undefined ||
        reading.completeness !== undefined;
      if (!carriesReading) return null;
      await ctx.db.patch(existing._id, {
        capturedAt: reading.capturedAt,
        // Describes this observation, so it is always overwritten — a later
        // refusal must not keep claiming the earlier read was complete.
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

/** The Team entry's label. Not a person, so it is not resolved from a name. */
const TEAM_CREDENTIAL_LABEL = "Team";

const usageLimitCredentialValidator = v.object({
  /** Absent = the shared team credential, which has no account row. */
  providerAccountId: v.optional(v.id("userProviderAccounts")),
  teamId: v.optional(v.id("teams")),
  accountLabel: v.string(),
});

type UsageLimitCredential = Infer<typeof usageLimitCredentialValidator>;

/**
 * Whether a launch in this repo would inject the shared
 * `CLAUDE_CODE_OAUTH_TOKEN` — the same team-then-repo lookup
 * `resolveAllEnvVars` does, on `key` alone. The value is never read: presence is
 * the whole question, and a query has no business decrypting a credential.
 */
async function hasSharedClaudeCredential(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
  teamId: Id<"teams">,
): Promise<boolean> {
  const key = PROVIDER_PRIMARY_AUTH_KEY[USAGE_LIMIT_PROVIDER];
  const teamVars = await db
    .query("teamEnvVars")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .first();
  if (teamVars?.vars.some((entry) => entry.key === key) === true) return true;
  const repoVars = await db
    .query("repoEnvVars")
    .withIndex("by_repo", (q) => q.eq("repoId", repoId))
    .first();
  return repoVars?.vars.some((entry) => entry.key === key) === true;
}

/**
 * Every Claude credential the viewer may run on in this repo, in the order the
 * card lists them: their own accounts, then teammates' shared ones, then the
 * shared team credential last.
 *
 * Exactly the picker's set (`listSelectableAccountsFor`) narrowed to Claude,
 * because the two answer the same question: a card that listed headroom for a
 * credential the user cannot spend — or omitted one they can — would be
 * describing somebody else's plan.
 */
async function listUsageLimitCredentials(
  ctx: QueryCtx,
  userId: Id<"users">,
  repoId: Id<"githubRepos">,
): Promise<UsageLimitCredential[]> {
  const accounts = await listSelectableAccountsFor(ctx, userId);
  const credentials: UsageLimitCredential[] = accounts
    .filter((account) => account.provider === USAGE_LIMIT_PROVIDER)
    .map((account) => ({
      providerAccountId: account._id,
      accountLabel: account.label,
    }));
  const repo = await ctx.db.get(repoId);
  const teamId = repo?.teamId;
  // The team row is keyed by team, so a repo outside one has nowhere to file a
  // reading and nothing to show for it.
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
    /** Quantized by the caller so expiry remains deterministic and cacheable. */
    now: v.number(),
  },
  returns: v.array(
    v.object({
      /** Absent = the shared team credential. */
      providerAccountId: v.optional(v.id("userProviderAccounts")),
      accountLabel: v.string(),
      /** Null when the credential has never reported, or not within 24h. */
      reading: v.union(v.null(), v.object(usageLimitReadingFields)),
    }),
  ),
  handler: async (ctx, args) => {
    if (isSandboxIdentity(await ctx.auth.getUserIdentity())) return [];
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const credentials = await listUsageLimitCredentials(
      ctx,
      ctx.userId,
      args.repoId,
    );
    const entries = [];
    for (const credential of credentials) {
      const row = await findUsageLimitRow(
        ctx.db,
        parseUsageLimitRowKey({
          provider: USAGE_LIMIT_PROVIDER,
          providerAccountId: credential.providerAccountId,
          teamId: credential.teamId,
        }),
      );
      entries.push({
        ...(credential.providerAccountId === undefined
          ? {}
          : { providerAccountId: credential.providerAccountId }),
        accountLabel: credential.accountLabel,
        reading: presentReading(row, args.now),
      });
    }
    return entries;
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

const refreshTargetArgs = {
  sessionId: v.optional(v.id("sessions")),
  projectId: v.optional(v.id("projects")),
  taskId: v.optional(v.id("agentTasks")),
};

type RefreshTarget =
  | { kind: "session"; sessionId: Id<"sessions"> }
  | { kind: "project"; projectId: Id<"projects"> }
  | { kind: "task"; taskId: Id<"agentTasks"> };

function parseRefreshTarget(args: {
  sessionId?: Id<"sessions">;
  projectId?: Id<"projects">;
  taskId?: Id<"agentTasks">;
}): RefreshTarget {
  if (
    args.sessionId !== undefined &&
    args.projectId === undefined &&
    args.taskId === undefined
  ) {
    return { kind: "session", sessionId: args.sessionId };
  }
  if (
    args.projectId !== undefined &&
    args.sessionId === undefined &&
    args.taskId === undefined
  ) {
    return { kind: "project", projectId: args.projectId };
  }
  if (
    args.taskId !== undefined &&
    args.sessionId === undefined &&
    args.projectId === undefined
  ) {
    return { kind: "task", taskId: args.taskId };
  }
  throw new Error(
    "Refresh needs exactly one of sessionId, projectId, or taskId",
  );
}

function isStoppedSandbox(status: string | undefined): boolean {
  return status === "closed" || status === "stopping";
}

/**
 * Whether the chip's surface has a running sandbox that can answer a refresh.
 * Stopped VMs must not be exec'd — Vercel `withResume` would wake them.
 */
export const getRefreshSurface = internalQuery({
  args: {
    userId: v.id("users"),
    repoId: v.id("githubRepos"),
    ...refreshTargetArgs,
  },
  returns: v.union(v.literal("idle"), v.literal("ready")),
  handler: async (ctx, args) => {
    const target = parseRefreshTarget(args);
    if (target.kind === "session") {
      const session = await ctx.db.get(target.sessionId);
      if (!session || session.repoId !== args.repoId) {
        throw new Error("Session not found");
      }
      if (!(await hasSessionAccess(ctx.db, session, args.userId))) {
        throw new Error("Not authorized");
      }
      if (!session.sandboxId || isStoppedSandbox(session.status)) {
        return "idle";
      }
      return "ready";
    }
    if (target.kind === "project") {
      const project = await ctx.db.get(target.projectId);
      if (!project || project.repoId !== args.repoId) {
        throw new Error("Project not found");
      }
      if (!(await hasRepoAccess(ctx.db, project.repoId, args.userId))) {
        throw new Error("Not authorized");
      }
      if (
        !project.sandboxId ||
        isStoppedSandbox(project.reviewProjectSandboxStatus)
      ) {
        return "idle";
      }
      return "ready";
    }
    const task = await ctx.db.get(target.taskId);
    if (!task || task.repoId !== args.repoId) {
      throw new Error("Task not found");
    }
    if (!(await hasTaskAccess(ctx.db, task, args.userId))) {
      throw new Error("Not authorized");
    }
    if (!task.sandboxId || isStoppedSandbox(task.reviewTaskSandboxStatus)) {
      return "idle";
    }
    return "ready";
  },
});

/**
 * Arms the level-triggered flag the live Claude daemon already polls. Returns
 * false when the sandbox is stopped so the action can toast "wake Eva"
 * instead of waiting for a report that will never arrive.
 */
export const requestRefresh = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    ...refreshTargetArgs,
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const target = parseRefreshTarget(args);
    const now = Date.now();
    if (target.kind === "session") {
      const session = await ctx.db.get(target.sessionId);
      if (!session || session.repoId !== args.repoId) {
        throw new Error("Session not found");
      }
      if (!(await hasSessionAccess(ctx.db, session, ctx.userId))) {
        throw new Error("Not authorized");
      }
      if (!session.sandboxId || isStoppedSandbox(session.status)) {
        return false;
      }
      await ensureSessionDaemonState(ctx, session);
      await syncSessionDaemonState(ctx, session, {
        usageRefreshRequestedAt: now,
      });
      return true;
    }
    if (target.kind === "project") {
      const project = await ctx.db.get(target.projectId);
      if (!project || project.repoId !== args.repoId) {
        throw new Error("Project not found");
      }
      if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
        throw new Error("Not authorized");
      }
      if (
        !project.sandboxId ||
        isStoppedSandbox(project.reviewProjectSandboxStatus)
      ) {
        return false;
      }
      await ctx.db.patch(target.projectId, { usageRefreshRequestedAt: now });
      return true;
    }
    const task = await ctx.db.get(target.taskId);
    if (!task || task.repoId !== args.repoId) {
      throw new Error("Task not found");
    }
    if (!(await hasTaskAccess(ctx.db, task, ctx.userId))) {
      throw new Error("Not authorized");
    }
    if (!task.sandboxId || isStoppedSandbox(task.reviewTaskSandboxStatus)) {
      return false;
    }
    await ctx.db.patch(target.taskId, { usageRefreshRequestedAt: now });
    return true;
  },
});

/**
 * Drops the refresh flag. The refresh action owns this so a failed lookup
 * can retry until the action stops waiting. claimPendingTurn only *reads*
 * the flag so an old callback cannot eat it.
 */
export const clearRefresh = authMutation({
  args: refreshTargetArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const target = parseRefreshTarget(args);
    if (target.kind === "session") {
      const session = await ctx.db.get(target.sessionId);
      if (!session) throw new Error("Session not found");
      if (!(await hasSessionAccess(ctx.db, session, ctx.userId))) {
        throw new Error("Not authorized");
      }
      await ensureSessionDaemonState(ctx, session);
      await syncSessionDaemonState(ctx, session, {
        usageRefreshRequestedAt: undefined,
      });
      return null;
    }
    if (target.kind === "project") {
      const project = await ctx.db.get(target.projectId);
      if (!project) throw new Error("Project not found");
      if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
        throw new Error("Not authorized");
      }
      await ctx.db.patch(target.projectId, {
        usageRefreshRequestedAt: undefined,
      });
      return null;
    }
    const task = await ctx.db.get(target.taskId);
    if (!task || !task.repoId) throw new Error("Task not found");
    if (!(await hasTaskAccess(ctx.db, task, ctx.userId))) {
      throw new Error("Not authorized");
    }
    await ctx.db.patch(target.taskId, { usageRefreshRequestedAt: undefined });
    return null;
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
  handler: async (ctx, args) => {
    await requireSandboxCaller(ctx);
    console.log(
      `[usageLimits] daemon refresh captured=${args.captured} available=${String(args.available ?? "omitted")} ${args.detail}`,
    );
    return null;
  },
});
