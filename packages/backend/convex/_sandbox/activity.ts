import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { sandboxActivityKindValidator } from "../_validators/tableFields";
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

type ActivityField = "lastUserActivityAt" | "lastAgentFinishedAt";

/**
 * Upserts one timestamp on the entity's activity row. Skips the write while the
 * stored value is younger than `ACTIVITY_TOUCH_MIN_INTERVAL_MS`, so a 3 s
 * preview poll or a burst of messages costs one write per minute at most.
 */
async function touchField(
  ctx: MutationCtx,
  ref: SandboxActivityRef,
  field: ActivityField,
  now: number,
): Promise<void> {
  const row = await getSandboxActivity(ctx.db, ref);
  const patch =
    field === "lastUserActivityAt"
      ? { lastUserActivityAt: now }
      : { lastAgentFinishedAt: now };
  if (!row) {
    await ctx.db.insert("sandboxActivity", { ...ref, ...patch });
    return;
  }
  if (!shouldTouchActivity(row[field], now)) return;
  await ctx.db.patch(row._id, patch);
}

/** Records a human interaction (message, tab open, preview traffic, presence). */
export async function touchUserActivity(
  ctx: MutationCtx,
  ref: SandboxActivityRef,
  now = Date.now(),
): Promise<void> {
  await touchField(ctx, ref, "lastUserActivityAt", now);
}

/** Records that an agent turn or run finished for the entity. */
export async function touchAgentFinished(
  ctx: MutationCtx,
  ref: SandboxActivityRef,
  now = Date.now(),
): Promise<void> {
  await touchField(ctx, ref, "lastAgentFinishedAt", now);
}

/** `touchUserActivity` for callers that only know the sandbox id. No-op when unowned. */
export async function touchUserActivityBySandboxId(
  ctx: MutationCtx,
  sandboxId: string,
  now = Date.now(),
): Promise<void> {
  const owner = await findSandboxOwnerBySandboxId(ctx.db, sandboxId);
  if (!owner) return;
  await touchUserActivity(ctx, activityRefForOwner(owner), now);
}

/** Internal entry for actions and HTTP routes that hold a sandbox id. */
export const touchBySandbox = internalMutation({
  args: { sandboxId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await touchUserActivityBySandboxId(ctx, args.sandboxId);
    return null;
  },
});

/** Internal entry for actions that hold the entity ref (e.g. the idle sweep). */
export const touchUser = internalMutation({
  args: sandboxActivityRefArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await touchUserActivity(ctx, args);
    return null;
  },
});
