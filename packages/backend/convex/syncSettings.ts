import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { internalQuery } from "./_generated/server";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import { syncSettingFields } from "./validators";
import type { Id } from "./_generated/dataModel";
import {
  findReposByOwnerAndName,
  gatherAccessibleRepos,
} from "./_githubRepos/helpers";

/** Throws unless the user can access at least one app row for the codebase. */
async function assertCodebaseAccess(
  ctx: MutationCtx,
  owner: string,
  name: string,
  userId: Id<"users">,
): Promise<void> {
  const repos = await findReposByOwnerAndName(ctx.db, { owner, name });
  for (const repo of repos) {
    if (await hasRepoAccess(ctx.db, repo._id, userId)) return;
  }
  throw new Error("Not authorized");
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
    const repos = await gatherAccessibleRepos(ctx.db, ctx.userId, true);
    const allowed = new Set(repos.map((repo) => `${repo.owner}/${repo.name}`));
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
    for (const repo of args.repos) {
      await assertCodebaseAccess(ctx, args.owner, repo.name, ctx.userId);
      await upsertSyncSetting(ctx, args.owner, repo.name, repo.enabled);
    }
    return null;
  },
});
