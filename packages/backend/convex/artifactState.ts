import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authQuery, authMutation, hasTeamAccess } from "./functions";

// Persistent state for hosted artifacts (`window.cowork.state` in the iframe
// shim). Two scopes:
//  - "user":   private to the signed-in viewer (ownerId = viewer)
//  - "shared": one copy for every member of the artifact's bound team
// Values are JSON text. Limits keep one artifact from filling the database and
// keep the live snapshot query small, because the parent pushes the whole
// snapshot into the iframe on every change.

export const MAX_STATE_KEY_LENGTH = 200;
export const MAX_STATE_VALUE_BYTES = 64 * 1024;
export const MAX_STATE_KEYS_PER_SCOPE = 200;

const scopeValidator = v.union(v.literal("user"), v.literal("shared"));
type Scope = "user" | "shared";

const entryValidator = v.object({ key: v.string(), value: v.string() });

/** True when the artifact exists and the caller is a member of its bound team. */
async function canAccessArtifact(
  ctx: QueryCtx,
  artifactId: Id<"artifacts">,
  userId: Id<"users">,
): Promise<boolean> {
  const artifact = await ctx.db.get(artifactId);
  return (
    artifact !== null &&
    (await hasTeamAccess(ctx.db, artifact.boundTeamId, userId))
  );
}

async function requireArtifactAccess(
  ctx: QueryCtx,
  artifactId: Id<"artifacts">,
  userId: Id<"users">,
): Promise<void> {
  if (!(await canAccessArtifact(ctx, artifactId, userId))) {
    throw new Error("Artifact not found or not accessible.");
  }
}

function ownerFor(scope: Scope, userId: Id<"users">): Id<"users"> | undefined {
  return scope === "user" ? userId : undefined;
}

function scopeRows(
  ctx: QueryCtx,
  artifactId: Id<"artifacts">,
  ownerId: Id<"users"> | undefined,
) {
  return ctx.db
    .query("artifactState")
    .withIndex("by_artifact_owner_key", (q) =>
      q.eq("artifactId", artifactId).eq("ownerId", ownerId),
    );
}

async function findEntry(
  ctx: QueryCtx,
  artifactId: Id<"artifacts">,
  ownerId: Id<"users"> | undefined,
  key: string,
) {
  return ctx.db
    .query("artifactState")
    .withIndex("by_artifact_owner_key", (q) =>
      q.eq("artifactId", artifactId).eq("ownerId", ownerId).eq("key", key),
    )
    .unique();
}

/** Full state snapshot for one artifact: the shared scope plus the caller's own. */
export const list = authQuery({
  args: { artifactId: v.id("artifacts") },
  returns: v.union(
    v.object({
      shared: v.array(entryValidator),
      user: v.array(entryValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    if (!(await canAccessArtifact(ctx, args.artifactId, ctx.userId))) {
      return null;
    }
    const [shared, user] = await Promise.all([
      scopeRows(ctx, args.artifactId, undefined).take(MAX_STATE_KEYS_PER_SCOPE),
      scopeRows(ctx, args.artifactId, ctx.userId).take(MAX_STATE_KEYS_PER_SCOPE),
    ]);
    const toEntry = (row: { key: string; value: string }) => ({
      key: row.key,
      value: row.value,
    });
    return { shared: shared.map(toEntry), user: user.map(toEntry) };
  },
});

/** Writes one key. `value` must be JSON text (the shim serialises it). */
export const set = authMutation({
  args: {
    artifactId: v.id("artifacts"),
    scope: scopeValidator,
    key: v.string(),
    value: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArtifactAccess(ctx, args.artifactId, ctx.userId);
    if (args.key.length === 0 || args.key.length > MAX_STATE_KEY_LENGTH) {
      throw new Error(
        `State key must be 1-${MAX_STATE_KEY_LENGTH} characters.`,
      );
    }
    if (new TextEncoder().encode(args.value).length > MAX_STATE_VALUE_BYTES) {
      throw new Error(
        `State value is larger than ${MAX_STATE_VALUE_BYTES / 1024} KB.`,
      );
    }
    try {
      JSON.parse(args.value);
    } catch {
      throw new Error("State value must be valid JSON text.");
    }

    const ownerId = ownerFor(args.scope, ctx.userId);
    const existing = await findEntry(ctx, args.artifactId, ownerId, args.key);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedBy: ctx.userId,
        updatedAt: now,
      });
      return null;
    }
    const count = (
      await scopeRows(ctx, args.artifactId, ownerId).take(
        MAX_STATE_KEYS_PER_SCOPE,
      )
    ).length;
    if (count >= MAX_STATE_KEYS_PER_SCOPE) {
      throw new Error(
        `Artifact state is limited to ${MAX_STATE_KEYS_PER_SCOPE} keys per scope.`,
      );
    }
    await ctx.db.insert("artifactState", {
      artifactId: args.artifactId,
      ownerId,
      key: args.key,
      value: args.value,
      updatedBy: ctx.userId,
      updatedAt: now,
    });
    return null;
  },
});

/** Deletes one key. A missing key is not an error. */
export const remove = authMutation({
  args: {
    artifactId: v.id("artifacts"),
    scope: scopeValidator,
    key: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArtifactAccess(ctx, args.artifactId, ctx.userId);
    const existing = await findEntry(
      ctx,
      args.artifactId,
      ownerFor(args.scope, ctx.userId),
      args.key,
    );
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

/** Deletes every state row of an artifact (all scopes, all owners). */
export async function deleteAllArtifactState(
  ctx: MutationCtx,
  artifactId: Id<"artifacts">,
): Promise<void> {
  const rows = await ctx.db
    .query("artifactState")
    .withIndex("by_artifact_owner_key", (q) => q.eq("artifactId", artifactId))
    .collect();
  await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
}
