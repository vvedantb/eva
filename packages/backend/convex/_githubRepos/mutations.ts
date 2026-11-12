import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  authMutation,
  getRepoWithAccess,
  hasTeamAccess,
  requireTeamOwner,
} from "../functions";
import { normalizePath } from "../repoUtils";
import { aiModelValidator, reasoningLevelValidator } from "../validators";
import {
  findAllSiblingRepoIds,
  findReposByOwnerAndName,
  isSameTeamSibling,
} from "./helpers";

/** Assigns a repository to a team (team owner only). */
export const assignToTeam = authMutation({
  args: {
    teamId: v.id("teams"),
    repoId: v.id("githubRepos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireTeamOwner(
      ctx.db,
      args.teamId,
      ctx.userId,
      "Only team owners can add repositories",
    );

    const repo = await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);

    if (repo.teamId === args.teamId) {
      throw new Error("Repository is already assigned to this team");
    }

    await ctx.db.patch(args.repoId, { teamId: args.teamId });
    return null;
  },
});

/** Removes a repository from a team (team owner only). */
export const removeFromTeam = authMutation({
  args: {
    teamId: v.id("teams"),
    repoId: v.id("githubRepos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireTeamOwner(
      ctx.db,
      args.teamId,
      ctx.userId,
      "Only team owners can remove repositories",
    );

    const repo = await ctx.db.get(args.repoId);
    if (!repo) {
      throw new Error("Repository not found");
    }

    if (repo.teamId !== args.teamId) {
      throw new Error("Repository is not part of this team");
    }

    await ctx.db.patch(args.repoId, { teamId: undefined });
    return null;
  },
});

interface CreateRepoArgs {
  owner: string;
  name: string;
  installationId: number;
  githubId: number;
  rootDirectory?: string;
  teamId?: Id<"teams">;
}

/**
 * Inserts a repo row, handling deduplication and monorepo sub-app setup.
 *
 * The caller (`github:connectRepo`) owns the installation authorization and
 * passes GitHub's own id, owner and name, never the client's.
 */
async function insertRepo(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  args: CreateRepoArgs,
  userId: Id<"users">,
): Promise<Id<"githubRepos">> {
  const normalizedRoot = args.rootDirectory
    ? normalizePath(args.rootDirectory)
    : undefined;

  const byGithubId = await ctx.db
    .query("githubRepos")
    .withIndex("by_github_id", (q) => q.eq("githubId", args.githubId))
    .collect();
  const match = byGithubId.find(
    (r) => (r.rootDirectory ?? undefined) === (normalizedRoot ?? undefined),
  );
  if (match) {
    await getRepoWithAccess(ctx.db, match._id, userId);
    throw new Error("Repository already exists");
  }

  const candidates = await findReposByOwnerAndName(ctx.db, args);

  const duplicate = candidates.find(
    (r) => (r.rootDirectory ?? undefined) === (normalizedRoot ?? undefined),
  );
  if (duplicate) {
    await getRepoWithAccess(ctx.db, duplicate._id, userId);
    if (duplicate.githubId === undefined) {
      await ctx.db.patch(duplicate._id, { githubId: args.githubId });
    }
    throw new Error("Repository already exists");
  }

  let teamId = args.teamId;
  if (teamId && !(await hasTeamAccess(ctx.db, teamId, userId))) {
    throw new Error("Not authorized to add repositories to this team");
  }
  if (!teamId) {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
      .collect();
    const personalTeam = teams.find((t) => t.isPersonal === true);
    teamId = personalTeam?._id;
  }

  if (normalizedRoot) {
    // An app row replaces its own team's root row, never another team's.
    const rootEntry = candidates.find(
      (r) =>
        !r.rootDirectory &&
        isSameTeamSibling(r, { teamId, connectedBy: userId }),
    );
    if (rootEntry) {
      await getRepoWithAccess(ctx.db, rootEntry._id, userId);
      await ctx.db.delete(rootEntry._id);
    }
  }

  const repoId = await ctx.db.insert("githubRepos", {
    owner: args.owner,
    name: args.name,
    installationId: args.installationId,
    githubId: args.githubId,
    connectedBy: userId,
    teamId,
    rootDirectory: normalizedRoot,
    defaultBaseBranch: "staging",
  });
  // A repo that already commits `.eva/config.json` is ready without setup.
  await ctx.scheduler.runAfter(0, internal._evaConfig.sync.syncEvaConfig, {
    repoId,
  });
  return repoId;
}

/**
 * Adds a repo for `userId`. Internal-only: `github:connectRepo` authorizes the
 * installation first and passes GitHub's canonical repo identity.
 */
export const createForInstallation = internalMutation({
  args: {
    owner: v.string(),
    name: v.string(),
    installationId: v.number(),
    githubId: v.number(),
    rootDirectory: v.optional(v.string()),
    teamId: v.optional(v.id("teams")),
    userId: v.id("users"),
  },
  returns: v.id("githubRepos"),
  handler: async (ctx, args) => {
    const { userId, ...repoArgs } = args;
    return await insertRepo(ctx, repoArgs, userId);
  },
});

/** Updates repository configuration settings, propagating shared settings to same-team sibling repos. */
export const updateConfig = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    defaultBaseBranch: v.optional(v.string()),
    defaultModel: v.optional(aiModelValidator),
    defaultReasoningLevel: v.optional(reasoningLevelValidator),
    defaultThinkingEnabled: v.optional(v.boolean()),
    defaultUse1mContext: v.optional(v.boolean()),
    defaultFastMode: v.optional(v.boolean()),
    sessionsVncEnabled: v.optional(v.boolean()),
    sessionsVscodeEnabled: v.optional(v.boolean()),
    sandboxReadExcluded: v.optional(v.boolean()),
    agentMemoryEnabled: v.optional(v.boolean()),
    deploymentProjectName: v.optional(v.string()),
    domains: v.optional(v.array(v.string())),
    systemPrompt: v.optional(v.string()),
    label: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const repo = await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);

    const sharedPatch: Record<string, string | boolean> = {};
    if (args.defaultBaseBranch !== undefined)
      sharedPatch.defaultBaseBranch = args.defaultBaseBranch;
    if (args.defaultModel !== undefined)
      sharedPatch.defaultModel = args.defaultModel;
    if (args.defaultReasoningLevel !== undefined)
      sharedPatch.defaultReasoningLevel = args.defaultReasoningLevel;
    if (args.defaultThinkingEnabled !== undefined)
      sharedPatch.defaultThinkingEnabled = args.defaultThinkingEnabled;
    if (args.defaultUse1mContext !== undefined)
      sharedPatch.defaultUse1mContext = args.defaultUse1mContext;
    if (args.defaultFastMode !== undefined)
      sharedPatch.defaultFastMode = args.defaultFastMode;
    if (args.sessionsVncEnabled !== undefined)
      sharedPatch.sessionsVncEnabled = args.sessionsVncEnabled;
    if (args.sessionsVscodeEnabled !== undefined)
      sharedPatch.sessionsVscodeEnabled = args.sessionsVscodeEnabled;
    if (args.sandboxReadExcluded !== undefined)
      sharedPatch.sandboxReadExcluded = args.sandboxReadExcluded;
    if (args.agentMemoryEnabled !== undefined)
      sharedPatch.agentMemoryEnabled = args.agentMemoryEnabled;

    const siblingIds = await findAllSiblingRepoIds(ctx.db, args.repoId);
    for (const siblingId of siblingIds) {
      await ctx.db.patch(siblingId, sharedPatch);
    }
    // `.eva/` is read from the default branch, so a new branch means a resync.
    if (
      args.defaultBaseBranch !== undefined &&
      args.defaultBaseBranch !== repo.defaultBaseBranch
    ) {
      await ctx.scheduler.runAfter(0, internal._evaConfig.sync.syncEvaConfig, {
        repoId: args.repoId,
      });
    }

    if (args.deploymentProjectName !== undefined) {
      await ctx.db.patch(args.repoId, {
        deploymentProjectName: args.deploymentProjectName,
      });
    }

    if (args.domains !== undefined) {
      await ctx.db.patch(args.repoId, {
        domains: args.domains.length > 0 ? args.domains : undefined,
      });
    }

    if (args.systemPrompt !== undefined) {
      await ctx.db.patch(args.repoId, {
        systemPrompt:
          args.systemPrompt.trim().length > 0 ? args.systemPrompt : undefined,
      });
    }

    if (args.label !== undefined) {
      const trimmed = args.label.trim();
      await ctx.db.patch(args.repoId, {
        label: trimmed.length > 0 ? trimmed : undefined,
      });
    }

    return null;
  },
});

/** Generates a short-lived upload URL for a repo logo image (auth-checked). */
export const generateLogoUploadUrl = authMutation({
  args: { repoId: v.id("githubRepos") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Sets (or clears with null) a repo's logo. Per-app: patches only this repo,
 * never siblings. Deletes the previously stored image so replacing or removing
 * a logo does not leave orphaned storage objects.
 */
export const setLogo = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    storageId: v.union(v.id("_storage"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const repo = await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    const previousId = repo.logoStorageId;
    if (previousId && previousId !== args.storageId) {
      await ctx.storage.delete(previousId);
    }

    await ctx.db.patch(args.repoId, {
      logoStorageId: args.storageId ?? undefined,
    });
    return null;
  },
});

/** Toggles the hidden visibility flag on a repository. */
export const toggleHidden = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    hidden: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);

    await ctx.db.patch(args.repoId, {
      hidden: args.hidden || undefined,
    });
    return null;
  },
});

/** Updates the MCP root prompt for a repo and its same-team siblings. */
export const updateMcpRootPrompt = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    mcpRootPrompt: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);

    const siblingIds = await findAllSiblingRepoIds(ctx.db, args.repoId);
    for (const siblingId of siblingIds) {
      await ctx.db.patch(siblingId, {
        mcpRootPrompt: args.mcpRootPrompt,
      });
    }
    return null;
  },
});


/** Deletes a GitHub repo entry by ID (internal use only). */
export const deleteInternal = internalMutation({
  args: { id: v.id("githubRepos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const repo = await ctx.db.get(args.id);
    if (repo) {
      await ctx.db.delete(args.id);
    }
    return null;
  },
});
