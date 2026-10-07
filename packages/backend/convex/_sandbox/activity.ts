import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import {
  sandboxActivityKindValidator,
  sandboxActivitySourceValidator,
  type SandboxActivitySource,
} from "../_validators/tableFields";
import { shouldTouchActivity } from "./idlePolicy";
import { findSandboxOwnerBySandboxId, type ResolvedSandboxOwner } from "./owner";

/** Identifies the entity a sandbox belongs to, independent of its sandbox id. */
export interface SandboxActivityRef {
  kind: Doc<"sandboxActivity">["kind"];
  entityId: string;
}

export const sandboxActivityRefArgs = {
  kind: sandboxActivityKindValidator,
  entityId: v.string(),
};

export function activityRefForOwner(
  owner: ResolvedSandboxOwner,
): SandboxActivityRef {
  return { kind: owner.kind, entityId: String(owner.doc._id) };
}

/**
 * Builds the ref from a bare chat parent id (session, task or project). Uses
 * `normalizeId` only, so it costs no reads; null for ids from other tables.
 */
export function activityRefForParentId(
  db: GenericDatabaseReader<DataModel>,
  parentId: string,
): SandboxActivityRef | null {
  if (db.normalizeId("sessions", parentId)) {
    return { kind: "session", entityId: parentId };
  }
  if (db.normalizeId("agentTasks", parentId)) {
    return { kind: "task", entityId: parentId };
  }
  if (db.normalizeId("projects", parentId)) {
    return { kind: "project", entityId: parentId };
  }
  return null;
}

export async function getSandboxActivity(
  db: GenericDatabaseReader<DataModel>,
  ref: SandboxActivityRef,
): Promise<Doc<"sandboxActivity"> | null> {
  return await db
    .query("sandboxActivity")
    .withIndex("by_entity", (q) =>
      q.eq("kind", ref.kind).eq("entityId", ref.entityId),
    )
    .first();
}

/** How a human interaction reached the sandbox, and who made it when known. */
export interface UserActivityAttribution {
  source: SandboxActivitySource;
  userId?: Id<"users">;
}

/**
 * Upserts the last-interaction stamp and its attribution. Skips the write while
 * the stamp is younger than `ACTIVITY_TOUCH_MIN_INTERVAL_MS` AND the source and
 * user are unchanged, so a 3 s preview poll costs one write per minute at most,
 * yet a chat message right after preview traffic still records "chat".
 */
export async function touchUserActivity(
  ctx: MutationCtx,
  ref: SandboxActivityRef,
  attribution: UserActivityAttribution,
  now = Date.now(),
): Promise<void> {
  const row = await getSandboxActivity(ctx.db, ref);
  const patch = {
    lastUserActivityAt: now,
    lastUserActivitySource: attribution.source,
    lastUserActivityUserId: attribution.userId,
  };
  if (!row) {
    await ctx.db.insert("sandboxActivity", { ...ref, ...patch });
    return;
  }
  const sameAttribution =
    row.lastUserActivitySource === attribution.source &&
    row.lastUserActivityUserId === attribution.userId;
  if (sameAttribution && !shouldTouchActivity(row.lastUserActivityAt, now)) {
    return;
  }
  await ctx.db.patch(row._id, patch);
}

/** Records that an agent turn or run finished for the entity. */
export async function touchAgentFinished(
  ctx: MutationCtx,
  ref: SandboxActivityRef,
  now = Date.now(),
): Promise<void> {
  const row = await getSandboxActivity(ctx.db, ref);
  if (!row) {
    await ctx.db.insert("sandboxActivity", { ...ref, lastAgentFinishedAt: now });
    return;
  }
  if (!shouldTouchActivity(row.lastAgentFinishedAt, now)) return;
  await ctx.db.patch(row._id, { lastAgentFinishedAt: now });
}

/** `touchUserActivity` for callers that only know the sandbox id. No-op when unowned. */
export async function touchUserActivityBySandboxId(
  ctx: MutationCtx,
  sandboxId: string,
  attribution: UserActivityAttribution,
  now = Date.now(),
): Promise<void> {
  const owner = await findSandboxOwnerBySandboxId(ctx.db, sandboxId);
  if (!owner) return;
  await touchUserActivity(ctx, activityRefForOwner(owner), attribution, now);
}

/**
 * Internal entry for actions and HTTP routes that hold a sandbox id. Actions
 * pass the caller's Clerk subject (`identity.subject`); it resolves to a user
 * row here because actions cannot read the database.
 */
export const touchBySandbox = internalMutation({
  args: {
    sandboxId: v.string(),
    source: sandboxActivitySourceValidator,
    clerkUserId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const clerkUserId = args.clerkUserId;
    const user = clerkUserId
      ? await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkUserId))
          .first()
      : null;
    await touchUserActivityBySandboxId(ctx, args.sandboxId, {
      source: args.source,
      userId: user?._id,
    });
    return null;
  },
});

/** Internal entry for actions that hold the entity ref (e.g. the idle sweep). */
export const touchUser = internalMutation({
  args: {
    ...sandboxActivityRefArgs,
    source: sandboxActivitySourceValidator,
    userId: v.optional(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await touchUserActivity(
      ctx,
      { kind: args.kind, entityId: args.entityId },
      { source: args.source, userId: args.userId },
    );
    return null;
  },
});
