import { v } from "convex/values";
import type { GenericDatabaseReader, StorageReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import { authQuery } from "../functions";
import {
  gatherAccessibleRepos,
  githubRepoValidator,
  githubRepoWithLogoValidator,
  pickDefaultVisibleAppRepo,
  userCanAccessRepo,
} from "./helpers";
import {
  getAIProviderAvailability,
  PROVIDER_PRIMARY_AUTH_KEY,
} from "../validators";
import { filterActiveEntities } from "../numId";
import { listTeammateUserIds } from "../_userProviderAccounts/sharing";

/** How many live sandboxes this app has across quick tasks and projects. */
async function repoActiveSandboxCount(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<number> {
  // Indexed reads (not full table scans): the index pins both repo and status,
  // and the take caps a pathological app the way `countActiveSessions` does.
  const activeProjects = filterActiveEntities(
    await db
      .query("projects")
      .withIndex("by_repo_and_sandbox_status", (q) =>
        q.eq("repoId", repoId).eq("reviewProjectSandboxStatus", "active"),
      )
      .take(64),
  ).filter((p) => p.sandboxId !== undefined);

  const activeTasks = filterActiveEntities(
    await db
      .query("agentTasks")
      .withIndex("by_repo_and_sandbox_status", (q) =>
        q.eq("repoId", repoId).eq("reviewTaskSandboxStatus", "active"),
      )
      .take(64),
  ).filter((t) => t.sandboxId !== undefined);

  return activeProjects.length + activeTasks.length;
}

/** Attaches a resolved `logoUrl` (from `logoStorageId`) to each repo. */
async function attachLogoUrls(
  storage: StorageReader,
  repos: Array<Doc<"githubRepos">>,
): Promise<Array<Doc<"githubRepos"> & { logoUrl?: string | null }>> {
  return await Promise.all(
    repos.map(async (repo) => ({
      ...repo,
      logoUrl: repo.logoStorageId
        ? await storage.getUrl(repo.logoStorageId)
        : undefined,
    })),
  );
}

/** Lists all GitHub repos accessible to the current user across their teams. */
export const list = authQuery({
  args: {
    includeHidden: v.optional(v.boolean()),
  },
  returns: v.array(githubRepoWithLogoValidator),
  handler: async (ctx, args) => {
    const repos = await gatherAccessibleRepos(
      ctx.db,
      ctx.userId,
      args.includeHidden === true,
    );
    return await attachLogoUrls(ctx.storage, repos);
  },
});

/**
 * How many active sandboxes (quick task or project) each app currently has.
 * Used by the left rail to badge app icons with a live count. Apps with none
 * are omitted, so the rail renders nothing for them.
 */
export const listActiveSandboxCounts = authQuery({
  args: {},
  returns: v.array(
    v.object({ repoId: v.id("githubRepos"), count: v.number() }),
  ),
  handler: async (ctx) => {
    const repos = await gatherAccessibleRepos(ctx.db, ctx.userId, false);
    const counts = await Promise.all(
      repos.map(async (repo) => ({
        repoId: repo._id,
        count: await repoActiveSandboxCount(ctx.db, repo._id),
      })),
    );
    return counts.filter((entry) => entry.count > 0);
  },
});

/** Counts active sessions (status active, not archived, PR still open) the user can see. */
export const countActiveSessions = authQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const repos = await gatherAccessibleRepos(ctx.db, ctx.userId, false);
    const perRepo = await Promise.all(
      repos.map(async (repo) => {
        const sessions = filterActiveEntities(
          await ctx.db
            .query("sessions")
            .withIndex("by_repo_and_status", (q) =>
              q.eq("repoId", repo._id).eq("status", "active"),
            )
            .take(64),
        );
        return sessions.filter(
          (s) =>
            s.archived !== true &&
            s.prState !== "merged" &&
            s.prState !== "closed" &&
            // The orchestrator is always active, so counting it made the rail
            // badge read "1" with no actual work in flight.
            s.isOrchestrator !== true,
        ).length;
      }),
    );
    return perRepo.reduce((total, n) => total + n, 0);
  },
});

/** Resolves the current logo image URL for a repo (null when none set). */
export const getLogoUrl = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const repo = await ctx.db.get(args.repoId);
    if (!repo) return null;
    if (!(await userCanAccessRepo(ctx.db, ctx.userId, repo))) return null;
    if (!repo.logoStorageId) return null;
    return await ctx.storage.getUrl(repo.logoStorageId);
  },
});

/** Gets a single GitHub repo by ID if the current user has access. */
export const get = authQuery({
  args: { id: v.id("githubRepos") },
  returns: v.union(githubRepoValidator, v.null()),
  handler: async (ctx, args) => {
    const repo = await ctx.db.get(args.id);
    if (!repo) return null;
    if (repo.hidden === true) return null;
    return (await userCanAccessRepo(ctx.db, ctx.userId, repo)) ? repo : null;
  },
});

/** Gets a single GitHub repo from a URL-provided ID string if the current user has access. */
export const getByIdString = authQuery({
  args: { repoId: v.string() },
  returns: v.union(githubRepoValidator, v.null()),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("githubRepos", args.repoId);
    if (!id) return null;

    const repo = await ctx.db.get(id);
    if (!repo) return null;
    if (repo.hidden === true) return null;
    return (await userCanAccessRepo(ctx.db, ctx.userId, repo)) ? repo : null;
  },
});

/** Checks which AI providers (Claude, Codex, Opencode, Cursor) are available for a repo based on configured env vars. */
export const getProviderAvailability = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.object({
    claude: v.boolean(),
    codex: v.boolean(),
    opencode: v.boolean(),
    cursor: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const unavailable = {
      claude: false,
      codex: false,
      opencode: false,
      cursor: false,
    };
    const repo = await ctx.db.get(args.repoId);
    if (!repo) {
      return unavailable;
    }

    if (!(await userCanAccessRepo(ctx.db, ctx.userId, repo))) {
      return unavailable;
    }

    const repoEnvDoc = await ctx.db
      .query("repoEnvVars")
      .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
      .first();
    const { teamId } = repo;
    const teamEnvDoc = teamId
      ? await ctx.db
          .query("teamEnvVars")
          .withIndex("by_team", (q) => q.eq("teamId", teamId))
          .first()
      : null;

    const keys = new Set<string>();
    for (const entry of teamEnvDoc?.vars ?? []) {
      keys.add(entry.key);
    }
    for (const entry of repoEnvDoc?.vars ?? []) {
      keys.add(entry.key);
    }

    // A provider account the viewer can run on makes that provider available
    // even when the team has no key for it — the account's credentials are
    // injected at launch. Their own accounts count, as do teammates' shared
    // ones, matching exactly what the model picker offers.
    const accounts = await ctx.db
      .query("userProviderAccounts")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();
    for (const account of accounts) {
      keys.add(PROVIDER_PRIMARY_AUTH_KEY[account.provider]);
    }
    for (const teammateId of await listTeammateUserIds(ctx.db, ctx.userId)) {
      const teammateAccounts = await ctx.db
        .query("userProviderAccounts")
        .withIndex("by_user", (q) => q.eq("userId", teammateId))
        .collect();
      for (const account of teammateAccounts) {
        if (account.shared === true) {
          keys.add(PROVIDER_PRIMARY_AUTH_KEY[account.provider]);
        }
      }
    }

    return getAIProviderAvailability(keys);
  },
});

/** Finds a GitHub repo by owner, name, and optional app name. */
export const getByOwnerAndName = authQuery({
  args: {
    owner: v.string(),
    name: v.string(),
    appName: v.optional(v.string()),
  },
  returns: v.union(githubRepoValidator, v.null()),
  handler: async (ctx, args) => {
    const candidates = await ctx.db
      .query("githubRepos")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", args.owner).eq("name", args.name),
      )
      .collect();

    let repo = args.appName
      ? candidates.find(
          (r) => r.rootDirectory?.split("/").pop() === args.appName,
        )
      : candidates.find((r) => !r.rootDirectory && r.hidden !== true);

    if (!repo && !args.appName) {
      repo = pickDefaultVisibleAppRepo(candidates);
    }

    if (!repo) return null;
    if (repo.hidden === true) return null;
    return (await userCanAccessRepo(ctx.db, ctx.userId, repo)) ? repo : null;
  },
});

/** Returns the team ID associated with a repo (internal use only). */
export const getTeamIdForRepo = internalQuery({
  args: { repoId: v.string() },
  returns: v.union(v.id("teams"), v.null()),
  handler: async (ctx, args) => {
    const normalizedId = ctx.db.normalizeId("githubRepos", args.repoId);
    if (!normalizedId) return null;

    const repo = await ctx.db.get(normalizedId);
    if (!repo) return null;

    return repo.teamId ?? null;
  },
});

/** Lists all non-hidden repos belonging to a specific team. */
export const listByTeam = authQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(githubRepoWithLogoValidator),
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_and_user", (q) =>
        q.eq("teamId", args.teamId).eq("userId", ctx.userId),
      )
      .first();

    if (!membership) return [];

    const repos = await ctx.db
      .query("githubRepos")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    return await attachLogoUrls(
      ctx.storage,
      repos.filter((r) => r.hidden !== true),
    );
  },
});

/** Internal: all repo ids sharing owner/name (monorepo siblings + self). */
export const listRepoIdsByOwnerAndName = internalQuery({
  args: { owner: v.string(), name: v.string() },
  returns: v.array(v.id("githubRepos")),
  handler: async (ctx, args) => {
    const siblings = await ctx.db
      .query("githubRepos")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", args.owner).eq("name", args.name),
      )
      .collect();
    return siblings.map((repo) => repo._id);
  },
});

/**
 * Internal: the GitHub App installation id for a repo, by owner/name. Used by
 * `/api/git-credentials` to check whether the requesting sandbox's allow-list
 * covers the repo it is authenticating for. Monorepo sibling app rows share
 * one GitHub repo, so the first match's installation applies to all of them.
 */
export const getInstallationIdByOwnerAndName = internalQuery({
  args: { owner: v.string(), name: v.string() },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const repo = await ctx.db
      .query("githubRepos")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", args.owner).eq("name", args.name),
      )
      .first();
    return repo ? repo.installationId : null;
  },
});

/** Lists sibling monorepo sub-apps for a given repo entry. */
export const listSiblingApps = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(
    v.object({
      _id: v.id("githubRepos"),
      appName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const repo = await ctx.db.get(args.repoId);
    if (!repo) return [];

    const siblings = await ctx.db
      .query("githubRepos")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", repo.owner).eq("name", repo.name),
      )
      .collect();

    return siblings
      .filter((s) => s._id !== args.repoId && s.rootDirectory)
      .map((s) => ({
        _id: s._id,
        appName: s.rootDirectory?.split("/").pop() ?? "",
      }));
  },
});

/** Returns the configured GitHub App slug used to build install/configure URLs. */
export const getAppSlug = authQuery({
  args: {},
  returns: v.string(),
  handler: async () => {
    const slug = process.env.GITHUB_APP_SLUG;
    if (!slug) {
      throw new Error("GITHUB_APP_SLUG is not set in Convex env");
    }
    return slug;
  },
});

/** Gets a GitHub repo by ID without access control (internal use only). */
export const findParentRepoByOwnerAndName = internalQuery({
  args: {
    owner: v.string(),
    name: v.string(),
  },
  returns: v.union(githubRepoValidator, v.null()),
  handler: async (ctx, args) => {
    const repos = await ctx.db
      .query("githubRepos")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", args.owner).eq("name", args.name),
      )
      .collect();
    const parent = repos.find((repo) => !repo.rootDirectory);
    return parent ?? repos[0] ?? null;
  },
});

/** Gets a GitHub repo by ID without access control (internal use only). */
export const getInternal = internalQuery({
  args: { id: v.id("githubRepos") },
  returns: v.union(githubRepoValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** Gets an accessible repo for server actions, including hidden app rows. */
export const getAccessibleForAction = authQuery({
  args: { id: v.id("githubRepos") },
  returns: v.union(githubRepoValidator, v.null()),
  handler: async (ctx, args) => {
    const repo = await ctx.db.get(args.id);
    if (!repo) return null;
    return (await userCanAccessRepo(ctx.db, ctx.userId, repo)) ? repo : null;
  },
});

/** Describes whether the caller owns, merely shares, or cannot use an installation. */
export const getInstallationAccessState = authQuery({
  args: { installationId: v.number() },
  returns: v.union(
    v.literal("unclaimed"),
    v.literal("owner"),
    v.literal("member"),
    v.literal("denied"),
  ),
  handler: async (ctx, args) => {
    const repos = await ctx.db
      .query("githubRepos")
      .withIndex("by_installation", (q) =>
        q.eq("installationId", args.installationId),
      )
      .collect();
    if (repos.length === 0) return "unclaimed";
    if (repos.some((repo) => repo.connectedBy === ctx.userId)) return "owner";
    for (const repo of repos) {
      if (await userCanAccessRepo(ctx.db, ctx.userId, repo)) return "member";
    }
    return "denied";
  },
});

/** Lists all repos grouped by codebase (owner/name). Each codebase shows root repo + sub-apps. */
export const listGroupedByCodebase = authQuery({
  args: {},
  returns: v.array(
    v.object({
      /** Codebase identifier: "owner/name" */
      codebase: v.string(),
      /** Display name for the codebase */
      displayName: v.string(),
      /** Whether this codebase has multiple apps (monorepo) */
      isMonorepo: v.boolean(),
      /** Apps within this codebase */
      apps: v.array(
        v.object({
          _id: v.id("githubRepos"),
          /** App name (rootDirectory folder name) or repo name if root */
          appName: v.string(),
          /** Full root directory path, null for root repo */
          rootDirectory: v.union(v.string(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const repos = await gatherAccessibleRepos(ctx.db, ctx.userId, false);

    // Group by owner/name
    const codebaseMap = new Map<
      string,
      {
        owner: string;
        name: string;
        apps: Array<{
          _id: (typeof repos)[number]["_id"];
          appName: string;
          rootDirectory: string | null;
        }>;
      }
    >();

    for (const repo of repos) {
      const codebaseKey = `${repo.owner}/${repo.name}`;
      if (!codebaseMap.has(codebaseKey)) {
        codebaseMap.set(codebaseKey, {
          owner: repo.owner,
          name: repo.name,
          apps: [],
        });
      }

      const appName = repo.rootDirectory
        ? (repo.rootDirectory.split("/").pop() ?? repo.name)
        : repo.name;

      codebaseMap.get(codebaseKey)?.apps.push({
        _id: repo._id,
        appName,
        rootDirectory: repo.rootDirectory ?? null,
      });
    }

    // Convert to array and sort
    const result = Array.from(codebaseMap.entries()).map(
      ([codebase, { name, apps }]) => ({
        codebase,
        displayName: name,
        isMonorepo: apps.length > 1,
        apps: apps.sort((a, b) => {
          // Root repo first, then alphabetically by app name
          if (a.rootDirectory === null) return -1;
          if (b.rootDirectory === null) return 1;
          return a.appName.localeCompare(b.appName);
        }),
      }),
    );

    // Sort codebases alphabetically
    return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
  },
});
