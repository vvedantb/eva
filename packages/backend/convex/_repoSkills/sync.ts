"use node";

import type { Octokit } from "octokit";
import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getInstallationOctokit } from "../githubAuth";
import {
  formatSkillSkipWarning,
  parseSkillMarkdown,
  SKILL_FILE_NAME,
} from "./skillMarkdown";
import { decodeGitHubContent } from "./decodeGitHubContent";

const SKILLS_ROOT_PATHS = [".agents/skills", ".claude/skills"];

type SkillDirectory = {
  path: string;
  fallbackTitle: string;
};

type SyncedSkill = {
  title: string;
  description: string;
  content: string;
  sourcePath: string;
  sourceSha: string;
};

type SyncTarget = {
  canonicalRepoId: Id<"githubRepos">;
  owner: string;
  name: string;
  installationId: number;
  ref: string;
};

type SyncOutcome = {
  synced: number;
  available: number;
  stale: number;
  skipped: number;
  warnings: string[];
};

function isGithubNotFound(error: Error): boolean {
  const message = error.message.toLowerCase();
  return message.includes("not found") || message.includes("404");
}

async function fetchSkillDirectories(
  octokit: Octokit,
  owner: string,
  name: string,
  ref: string,
  rootPath: string,
): Promise<SkillDirectory[] | null> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo: name,
      path: rootPath,
      ref,
    });

    if (!Array.isArray(response.data)) return [];

    return response.data
      .filter((entry) => entry.type === "dir")
      .flatMap((entry) => {
        if (typeof entry.path !== "string" || typeof entry.name !== "string") {
          return [];
        }
        return [{ path: entry.path, fallbackTitle: entry.name }];
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  } catch (error) {
    if (error instanceof Error && isGithubNotFound(error)) {
      return null;
    }
    throw error;
  }
}

async function fetchSkill(
  octokit: Octokit,
  owner: string,
  name: string,
  ref: string,
  directory: SkillDirectory,
): Promise<{ ok: true; skill: SyncedSkill } | { ok: false; warning: string }> {
  const sourcePath = `${directory.path}/${SKILL_FILE_NAME}`;
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo: name,
      path: sourcePath,
      ref,
    });

    if (Array.isArray(response.data) || response.data.type !== "file") {
      return {
        ok: false,
        warning: formatSkillSkipWarning(directory.path, "missing_file"),
      };
    }
    if (
      !("content" in response.data) ||
      typeof response.data.content !== "string"
    ) {
      return {
        ok: false,
        warning: formatSkillSkipWarning(directory.path, "missing_file"),
      };
    }
    if (!("sha" in response.data) || typeof response.data.sha !== "string") {
      return {
        ok: false,
        warning: formatSkillSkipWarning(directory.path, "missing_file"),
      };
    }

    const markdown = decodeGitHubContent(response.data.content);
    const parsed = parseSkillMarkdown(markdown, directory.fallbackTitle);
    if (!parsed.ok) {
      return {
        ok: false,
        warning: formatSkillSkipWarning(directory.path, parsed.reason),
      };
    }

    return {
      ok: true,
      skill: {
        title: parsed.skill.title,
        description: parsed.skill.description,
        content: markdown,
        sourcePath,
        sourceSha: response.data.sha,
      },
    };
  } catch (error) {
    if (error instanceof Error && isGithubNotFound(error)) {
      return {
        ok: false,
        warning: formatSkillSkipWarning(directory.path, "missing_file"),
      };
    }
    throw error;
  }
}

/** Shared GitHub scan + apply for manual, cron, and webhook skill sync. */
async function syncSkillsForTarget(
  ctx: ActionCtx,
  target: SyncTarget,
): Promise<SyncOutcome> {
  const octokit = await getInstallationOctokit(target.installationId);
  const directoriesByRoot = await Promise.all(
    SKILLS_ROOT_PATHS.map((rootPath) =>
      fetchSkillDirectories(
        octokit,
        target.owner,
        target.name,
        target.ref,
        rootPath,
      ),
    ),
  );
  const directories = directoriesByRoot.flatMap((entries) => entries ?? []);

  const warnings: string[] = [];
  let skipped = 0;

  if (directoriesByRoot.every((entries) => entries === null)) {
    warnings.push(
      `No ${SKILLS_ROOT_PATHS.join(" or ")} directory found on ${target.ref}. Existing skills were marked stale.`,
    );
    const result = await ctx.runMutation(internal.repoSkills.applyGithubSync, {
      repoId: target.canonicalRepoId,
      skills: [],
      syncedAt: Date.now(),
    });
    return { ...result, skipped, warnings };
  }

  const skills: SyncedSkill[] = [];
  const seenSourcePaths = new Set<string>();
  for (const directory of directories) {
    const fetchResult = await fetchSkill(
      octokit,
      target.owner,
      target.name,
      target.ref,
      directory,
    );
    if (!fetchResult.ok) {
      skipped++;
      warnings.push(fetchResult.warning);
      continue;
    }
    const skill = fetchResult.skill;
    if (seenSourcePaths.has(skill.sourcePath)) {
      skipped++;
      warnings.push(`Skipped duplicate skill source ${skill.sourcePath}.`);
      continue;
    }
    seenSourcePaths.add(skill.sourcePath);
    skills.push(skill);
  }

  const result = await ctx.runMutation(internal.repoSkills.applyGithubSync, {
    repoId: target.canonicalRepoId,
    skills,
    syncedAt: Date.now(),
  });
  return { ...result, skipped, warnings };
}

const syncOutcomeValidator = v.object({
  synced: v.number(),
  available: v.number(),
  stale: v.number(),
  skipped: v.number(),
  warnings: v.array(v.string()),
});

/** Manual Settings → Sync from GitHub (authenticated). */
export const syncFromGithub = action({
  args: { repoId: v.id("githubRepos") },
  returns: syncOutcomeValidator,
  handler: async (ctx, args): Promise<SyncOutcome> => {
    const userId: Id<"users"> | null = await ctx.runQuery(
      internal.auth.getUserIdFromIdentity,
      {},
    );
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const target: SyncTarget = await ctx.runQuery(
      internal.repoSkills.getSyncTarget,
      {
        repoId: args.repoId,
        userId,
      },
    );
    return await syncSkillsForTarget(ctx, target);
  },
});

/**
 * System sync for one repo (cron / webhook). Uses the installation token —
 * no end-user auth required.
 */
export const syncRepoInternal = internalAction({
  args: { repoId: v.id("githubRepos") },
  returns: v.union(syncOutcomeValidator, v.null()),
  handler: async (ctx, args): Promise<SyncOutcome | null> => {
    const target: SyncTarget | null = await ctx.runQuery(
      internal.repoSkills.getSyncTargetSystem,
      {
        repoId: args.repoId,
      },
    );
    if (!target) return null;
    return await syncSkillsForTarget(ctx, target);
  },
});

/**
 * Schedules a staggered per-repo skill sync for every connected canonical
 * codebase. Invoked by the periodic cron in `crons.ts`.
 */
export const syncAllRepos = internalAction({
  args: {},
  returns: v.object({ scheduled: v.number() }),
  handler: async (ctx): Promise<{ scheduled: number }> => {
    const repoIds: Array<Id<"githubRepos">> = await ctx.runQuery(
      internal.repoSkills.listCanonicalReposForSkillSync,
      {},
    );
    // Stagger to stay under GitHub secondary rate limits across many installs.
    for (let i = 0; i < repoIds.length; i++) {
      const repoId = repoIds[i];
      if (repoId === undefined) continue;
      await ctx.scheduler.runAfter(
        i * 2000,
        internal._repoSkills.sync.syncRepoInternal,
        { repoId },
      );
    }
    return { scheduled: repoIds.length };
  },
});
