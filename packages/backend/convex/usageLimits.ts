import { loadSessionChat } from "./_sessionChats/helpers";
import { v } from "convex/values";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import { internalQuery } from "./_generated/server";
import {
  agentUsageLimitFields,
  usageLimitProviderValidator,
} from "./validators";
import type { Doc, Id } from "./_generated/dataModel";
import { isAccountUsableBy } from "./_userProviderAccounts/sharing";

/**
 * Agent plan usage limits. A sandbox turn captures how much of the provider's
 * plan it has used and reports it here; the UI reads it back per repo.
 *
 * Deliberately its own mutation rather than extra completion arguments: the
 * completion mutation is shared by every entity workflow, and a reading that is
 * pure telemetry has no business widening that contract.
 *
 * Auth mirrors the completion mutations — the sandbox calls in with its
 * CONVEX_TOKEN identity (the launching user), so repo access is checked exactly
 * as `sessionWorkflow:handleCompletion` checks it.
 */

const agentUsageLimitValidator = v.object({
  _id: v.id("agentUsageLimits"),
  _creationTime: v.number(),
  ...agentUsageLimitFields,
  /**
   * The account's current name, resolved on read rather than stored, so a
   * rename shows up without rewriting rows. Absent when the run used the shared
   * team credential, or when the account has since been deleted.
   */
  accountLabel: v.optional(v.string()),
});

/**
 * Upserts the reading for one (repo, provider, account) triple. Authoritative
 * provider snapshots replace the row so vanished windows are cleared; partial
 * stream observations patch only what they actually observed.
 *
 * The account is part of the key because plan limits are per account — keyed on
 * the provider alone, a second connected account's reading would overwrite the
 * first. A run on the shared team credential reports no account and keeps its
 * own row.
 */
type UsageWindow = NonNullable<Doc<"agentUsageLimits">["windows"]>[number];

/** The stored discriminant. Derived from the row so the two cannot drift. */
export type UsageLimitCompleteness = NonNullable<
  Doc<"agentUsageLimits">["completeness"]
>;

/** Readings older than this are no longer evidence of the provider's state. */
export const USAGE_LIMIT_READING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

export function isUsageLimitReadingFresh(
  capturedAt: number,
  now: number,
): boolean {
  return now - capturedAt <= USAGE_LIMIT_READING_MAX_AGE_MS;
}

export const report = authMutation({
  args: {
    ...agentUsageLimitFields,
    /** Superseded by `completeness`. Callback bundles baked before the
     * discriminant still send this boolean, so it is still honoured; bundles
     * that send neither safely receive merge semantics. */
    snapshotComplete: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    if (args.providerAccountId) {
      const account = await ctx.db.get(args.providerAccountId);
      if (
        !account ||
        account.provider !== args.provider ||
        !(await isAccountUsableBy(ctx.db, account, ctx.userId))
      ) {
        throw new Error("Provider account not found");
      }
    }
    const existing = await ctx.db
      .query("agentUsageLimits")
      .withIndex("by_repo_provider_account", (q) =>
        q
          .eq("repoId", args.repoId)
          .eq("provider", args.provider)
          .eq("providerAccountId", args.providerAccountId),
      )
      .first();
    const { snapshotComplete, ...reading } = args;
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
 * The stored row for one (repo, provider, account) triple. The refresh action
 * waits until `capturedAt` moves past the pre-refresh value, which is how it
 * knows the live daemon actually reported.
 */
export const getReadingInternal = internalQuery({
  args: {
    repoId: v.id("githubRepos"),
    provider: usageLimitProviderValidator,
    providerAccountId: v.optional(v.id("userProviderAccounts")),
  },
  returns: v.union(
    v.null(),
    v.object({
      subscriptionType: v.optional(v.string()),
      capturedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentUsageLimits")
      .withIndex("by_repo_provider_account", (q) =>
        q
          .eq("repoId", args.repoId)
          .eq("provider", args.provider)
          .eq("providerAccountId", args.providerAccountId),
      )
      .first();
    if (!existing) return null;
    return {
      capturedAt: existing.capturedAt,
      ...(existing.subscriptionType === undefined
        ? {}
        : { subscriptionType: existing.subscriptionType }),
    };
  },
});

/**
 * Every account's latest reading for a repo, most recently captured first. One
 * provider can appear more than once — once per connected account it has run on.
 *
 * A row belonging to a provider account the caller may not run on is omitted
 * entirely, not merely stripped of its label: plan headroom is a fact about
 * somebody else's account. Rows with no account (the shared team credential)
 * are visible to everyone with repo access.
 */
export const getByRepo = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    /** Quantized by the caller so expiry remains deterministic and cacheable. */
    now: v.number(),
  },
  returns: v.array(agentUsageLimitValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];
    const rows = await ctx.db
      .query("agentUsageLimits")
      .withIndex("by_repo_provider_account", (q) => q.eq("repoId", args.repoId))
      .collect();
    const visible = [];
    for (const row of rows) {
      if (!isUsageLimitReadingFresh(row.capturedAt, args.now)) continue;
      const next = { ...row };
      const reportedWindows = next.windows;
      if (reportedWindows) {
        const activeWindows = reportedWindows.filter(
          (window) =>
            window.resetsAt === undefined || window.resetsAt > args.now,
        );
        if (activeWindows.length > 0) {
          next.windows = activeWindows;
        } else {
          delete next.windows;
          // A status observed alongside windows expires when all of those
          // windows reset. Windowless status-only events remain until the row's
          // captured-at freshness limit above.
          //
          // The discriminant goes with it: "complete" described a reading whose
          // windows have all since reset, and leaving it would have the UI
          // report that the provider has no plan windows at all. A reading that
          // never carried windows keeps it — that is the case it exists for.
          if (reportedWindows.length > 0) {
            delete next.status;
            delete next.completeness;
          }
        }
      }
      // A row with no account ran on the shared team credential and belongs to
      // no one in particular, so anyone with repo access may see it.
      const accountId = next.providerAccountId;
      const account =
        accountId === undefined ? null : await ctx.db.get(accountId);
      const canSeeAccount =
        account !== null &&
        account.provider === next.provider &&
        (await isAccountUsableBy(ctx.db, account, ctx.userId));
      // An account the caller cannot run on is one whose plan headroom is none
      // of their business, so the row is dropped rather than anonymised.
      if (accountId !== undefined && !canSeeAccount) continue;
      visible.push({
        ...next,
        ...(canSeeAccount && account ? { accountLabel: account.label } : {}),
      });
    }
    visible.sort((a, b) => b.capturedAt - a.capturedAt);
    return visible;
  },
});

const refreshTargetArgs = {
  /** The live chat whose daemon reports the reading (its session's sandbox). */
  chatId: v.optional(v.id("sessionChats")),
  projectId: v.optional(v.id("projects")),
  taskId: v.optional(v.id("agentTasks")),
};

type RefreshTarget =
  | { kind: "session"; chatId: Id<"sessionChats"> }
  | { kind: "project"; projectId: Id<"projects"> }
  | { kind: "task"; taskId: Id<"agentTasks"> };

function parseRefreshTarget(args: {
  chatId?: Id<"sessionChats">;
  projectId?: Id<"projects">;
  taskId?: Id<"agentTasks">;
}): RefreshTarget {
  if (
    args.chatId !== undefined &&
    args.projectId === undefined &&
    args.taskId === undefined
  ) {
    return { kind: "session", chatId: args.chatId };
  }
  if (
    args.projectId !== undefined &&
    args.chatId === undefined &&
    args.taskId === undefined
  ) {
    return { kind: "project", projectId: args.projectId };
  }
  if (
    args.taskId !== undefined &&
    args.chatId === undefined &&
    args.projectId === undefined
  ) {
    return { kind: "task", taskId: args.taskId };
  }
  throw new Error(
    "Refresh needs exactly one of chatId, projectId, or taskId",
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
      const context = await loadSessionChat(ctx.db, target.chatId);
      if (!context || context.session.repoId !== args.repoId) {
        throw new Error("Chat not found");
      }
      const { session } = context;
      if (!(await hasRepoAccess(ctx.db, session.repoId, args.userId))) {
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
    if (!(await hasRepoAccess(ctx.db, task.repoId, args.userId))) {
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
    const target = parseRefreshTarget(args);
    const now = Date.now();
    if (target.kind === "session") {
      const context = await loadSessionChat(ctx.db, target.chatId);
      if (!context || context.session.repoId !== args.repoId) {
        throw new Error("Chat not found");
      }
      const { chat, session } = context;
      if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
        throw new Error("Not authorized");
      }
      if (!session.sandboxId || isStoppedSandbox(session.status)) {
        return false;
      }
      await ctx.db.patch(chat._id, { usageRefreshRequestedAt: now });
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
    if (!(await hasRepoAccess(ctx.db, task.repoId, ctx.userId))) {
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
    const target = parseRefreshTarget(args);
    if (target.kind === "session") {
      const context = await loadSessionChat(ctx.db, target.chatId);
      if (!context) throw new Error("Chat not found");
      const { chat, session } = context;
      if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
        throw new Error("Not authorized");
      }
      await ctx.db.patch(chat._id, { usageRefreshRequestedAt: undefined });
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
    if (!(await hasRepoAccess(ctx.db, task.repoId, ctx.userId))) {
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
  handler: async (_ctx, args) => {
    console.log(
      `[usageLimits] daemon refresh captured=${args.captured} available=${String(args.available ?? "omitted")} ${args.detail}`,
    );
    return null;
  },
});
