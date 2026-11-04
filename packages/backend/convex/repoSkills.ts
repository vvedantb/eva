import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { authQuery, hasRepoAccess } from "./functions";
import { resolveCanonicalRepoId } from "./_githubRepos/helpers";
import { upsertRepoSkillContent } from "./_repoSkills/content";

export { syncFromGithub } from "./_repoSkills/sync";

const repoSkillListItemValidator = v.object({
  _id: v.id("repoSkills"),
  _creationTime: v.number(),
  repoId: v.id("githubRepos"),
  title: v.string(),
  description: v.string(),
  sourcePath: v.optional(v.string()),
  sourceSha: v.optional(v.string()),
  available: v.boolean(),
  lastSyncedAt: v.optional(v.number()),
  unavailableSince: v.optional(v.number()),
  createdAt: v.number(),
});

const syncedSkillValidator = v.object({
  title: v.string(),
  description: v.string(),
  content: v.string(),
  sourcePath: v.string(),
  sourceSha: v.string(),
});

const repoSkillContentValidator = v.object({
  title: v.string(),
  sourcePath: v.optional(v.string()),
  content: v.string(),
});

/** Lists all skills for a repo (resolved to canonical repo for monorepos). */
export const listByRepo = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(repoSkillListItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return [];
    }
    const canonicalId = await resolveCanonicalRepoId(ctx.db, args.repoId);
    const skills = await ctx.db
      .query("repoSkills")
      .withIndex("by_repo", (q) => q.eq("repoId", canonicalId))
      .collect();

    return skills
      .map((skill) => ({
        _id: skill._id,
        _creationTime: skill._creationTime,
        repoId: skill.repoId,
        title: skill.title,
        description: skill.description ?? skill.prompt ?? "",
        sourcePath: skill.sourcePath,
        sourceSha: skill.sourceSha,
        available: skill.available ?? false,
        lastSyncedAt: skill.lastSyncedAt,
        unavailableSince: skill.unavailableSince,
        createdAt: skill.createdAt,
      }))
      .sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  },
});

/** Returns full SKILL.md content for the settings viewer (lazy-loaded). */
export const getContentById = authQuery({
  args: { skillId: v.id("repoSkills") },
  returns: v.union(v.null(), repoSkillContentValidator),
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) return null;
    if (!(await hasRepoAccess(ctx.db, skill.repoId, ctx.userId))) {
      return null;
    }
    const splitContent = await ctx.db
      .query("repoSkillContents")
      .withIndex("by_skill", (q) => q.eq("skillId", skill._id))
      .unique();
    const content = splitContent?.content ?? skill.content;
    if (!content) return null;

    return {
      title: skill.title,
      sourcePath: skill.sourcePath,
      content,
    };
  },
});

const syncTargetValidator = v.object({
  canonicalRepoId: v.id("githubRepos"),
  owner: v.string(),
  name: v.string(),
  installationId: v.number(),
  ref: v.string(),
});

/** Resolves the GitHub repo and ref used by the authenticated sync action. */
export const getSyncTarget = internalQuery({
  args: { repoId: v.id("githubRepos"), userId: v.id("users") },
  returns: syncTargetValidator,
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, args.userId))) {
      throw new Error("Not authorized");
    }

    const canonicalRepoId = await resolveCanonicalRepoId(ctx.db, args.repoId);
    const repo = await ctx.db.get(canonicalRepoId);
    if (!repo) {
      throw new Error("Repository not found");
    }

    return {
      canonicalRepoId,
      owner: repo.owner,
      name: repo.name,
      installationId: repo.installationId,
      ref: repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH,
    };
  },
});

/**
 * System sync target (cron / webhook). No user ACL — caller must already be a
 * trusted internal path. Skips disconnected repos.
 */
export const getSyncTargetSystem = internalQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.union(syncTargetValidator, v.null()),
  handler: async (ctx, args) => {
    const canonicalRepoId = await resolveCanonicalRepoId(ctx.db, args.repoId);
    const repo = await ctx.db.get(canonicalRepoId);
    if (!repo || repo.connected === false) return null;

    return {
      canonicalRepoId,
      owner: repo.owner,
      name: repo.name,
      installationId: repo.installationId,
      ref: repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH,
    };
  },
});

/**
 * One connected canonical repo id per GitHub owner/name codebase. Used by the
 * periodic skill-sync cron so each install is scanned once.
 */
export const listCanonicalReposForSkillSync = internalQuery({
  args: {},
  returns: v.array(v.id("githubRepos")),
  handler: async (ctx) => {
    const repos = await ctx.db.query("githubRepos").collect();
    const byCodebase = new Map<string, (typeof repos)[number]>();

    for (const repo of repos) {
      if (repo.connected === false) continue;
      if (repo.hidden === true) continue;
      const key = `${repo.owner}/${repo.name}`;
      const existing = byCodebase.get(key);
      if (!existing) {
        byCodebase.set(key, repo);
        continue;
      }
      const repoIsRoot =
        repo.parentRepoId === undefined && repo.rootDirectory === undefined;
      const existingIsRoot =
        existing.parentRepoId === undefined &&
        existing.rootDirectory === undefined;
      if (repoIsRoot && !existingIsRoot) {
        byCodebase.set(key, repo);
      }
    }

    return Promise.all(
      [...byCodebase.values()].map((repo) =>
        resolveCanonicalRepoId(ctx.db, repo._id),
      ),
    );
  },
});

/** Applies a GitHub skill scan, keeping missing rows as stale visual history. */
export const applyGithubSync = internalMutation({
  args: {
    repoId: v.id("githubRepos"),
    skills: v.array(syncedSkillValidator),
    syncedAt: v.number(),
  },
  returns: v.object({
    synced: v.number(),
    available: v.number(),
    stale: v.number(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("repoSkills")
      .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
      .collect();

    const existingBySourcePath = new Map(
      existing
        .filter((skill) => skill.sourcePath !== undefined)
        .map((skill) => [skill.sourcePath ?? "", skill]),
    );

    const syncedPaths = new Set<string>();
    for (const skill of args.skills) {
      syncedPaths.add(skill.sourcePath);
      const existingSkill = existingBySourcePath.get(skill.sourcePath);
      if (existingSkill) {
        await upsertRepoSkillContent(ctx, existingSkill._id, skill.content);
        await ctx.db.patch(existingSkill._id, {
          title: skill.title,
          description: skill.description,
          content: undefined,
          sourceSha: skill.sourceSha,
          available: true,
          lastSyncedAt: args.syncedAt,
          unavailableSince: undefined,
          prompt: undefined,
        });
      } else {
        const skillId = await ctx.db.insert("repoSkills", {
          repoId: args.repoId,
          title: skill.title,
          description: skill.description,
          sourcePath: skill.sourcePath,
          sourceSha: skill.sourceSha,
          available: true,
          lastSyncedAt: args.syncedAt,
          createdAt: args.syncedAt,
        });
        await upsertRepoSkillContent(ctx, skillId, skill.content);
      }
    }

    let stale = 0;
    for (const skill of existing) {
      const missingFromGithub =
        skill.sourcePath === undefined || !syncedPaths.has(skill.sourcePath);
      if (!missingFromGithub) continue;

      stale++;
      if (
        skill.available !== false ||
        skill.unavailableSince === undefined ||
        skill.prompt !== undefined
      ) {
        await ctx.db.patch(skill._id, {
          available: false,
          unavailableSince: skill.unavailableSince ?? args.syncedAt,
          lastSyncedAt: args.syncedAt,
          prompt: undefined,
        });
      }
    }

    return {
      synced: args.skills.length,
      available: args.skills.length,
      stale,
    };
  },
});
