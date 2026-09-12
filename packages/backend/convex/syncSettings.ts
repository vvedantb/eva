import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { internalQuery } from "./_generated/server";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import { rejectSandboxCaller } from "./_auth/sandboxIdentity";
import { syncSettingFields } from "./validators";
import type { Id } from "./_generated/dataModel";

/** Throws unless the user can access at least one app row for the codebase. */
async function assertCodebaseAccess(
  ctx: MutationCtx,
  owner: string,
  name: string,
  userId: Id<"users">,
): Promise<void> {
  const repos = await ctx.db
    .query("githubRepos")
    .withIndex("by_owner_and_name", (q) =>
      q.eq("owner", owner).eq("name", name),
    )
    .collect();
  if (repos.length === 0) throw new Error("Not authorized");
  for (const repo of repos) {
    if (!(await hasRepoAccess(ctx.db, repo._id, userId))) {
      throw new Error("Not authorized");
    }
  }
}

/** Creates the sync setting for an owner/name pair, or patches its enabled flag if it already exists. */
async function upsertSyncSetting(
  ctx: MutationCtx,
  owner: string,
  name: string,
  enabled: boolean,
): Promise<void> {
  const existing = await ctx.db
    .query("syncSettings")
    .withIndex("by_owner_and_name", (q) =>
      q.eq("owner", owner).eq("name", name),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, { enabled });
  } else {
    await ctx.db.insert("syncSettings", { owner, name, enabled });
  }
}

/** Lists all sync settings as owner/name/enabled triples (internal use only). */
export const listAll = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      owner: v.string(),
      name: v.string(),
      enabled: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const settings = await ctx.db.query("syncSettings").collect();
    return settings.map((s) => ({
      owner: s.owner,
      name: s.name,
      enabled: s.enabled,
    }));
  },
});

/** Lists all sync settings with full document fields for the authenticated user. */
export const list = authQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("syncSettings"),
      _creationTime: v.number(),
      ...syncSettingFields,
    }),
  ),
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();
    const teamIds = new Set(memberships.map((membership) => membership.teamId));
    const connected = await ctx.db
      .query("githubRepos")
      .withIndex("by_connected_by", (q) => q.eq("connectedBy", ctx.userId))
      .collect();
    const teamRepos = await Promise.all(
      [...teamIds].map((teamId) =>
        ctx.db
          .query("githubRepos")
          .withIndex("by_team", (q) => q.eq("teamId", teamId))
          .collect(),
      ),
    );
    const allowed = new Set(
      [...connected, ...teamRepos.flat()].map(
        (repo) => `${repo.owner}/${repo.name}`,
      ),
    );
    const settings = await ctx.db.query("syncSettings").collect();
    return settings.filter((setting) =>
      allowed.has(`${setting.owner}/${setting.name}`),
    );
  },
});

/** Creates or updates the enabled flag for a single repo's sync setting. */
export const set = authMutation({
  args: {
    owner: v.string(),
    name: v.string(),
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await assertCodebaseAccess(ctx, args.owner, args.name, ctx.userId);
    await upsertSyncSetting(ctx, args.owner, args.name, args.enabled);
    return null;
  },
});

/** Creates or updates sync settings for multiple repos under the same owner in one call. */
export const bulkSet = authMutation({
  args: {
    owner: v.string(),
    repos: v.array(v.object({ name: v.string(), enabled: v.boolean() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    for (const repo of args.repos) {
      await assertCodebaseAccess(ctx, args.owner, repo.name, ctx.userId);
      await upsertSyncSetting(ctx, args.owner, repo.name, repo.enabled);
    }
    return null;
  },
});
