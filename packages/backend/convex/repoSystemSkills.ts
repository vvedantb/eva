import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import { internalQuery } from "./_generated/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import { resolveCanonicalRepoId } from "./_githubRepos/helpers";
import {
  buildStubMarkdown,
  isSystemSkillName,
  listSystemSkills,
  SYSTEM_SKILLS,
  type SystemSkillHydration,
  type SystemSkillName,
} from "./_systemSkills/registry";
import { buildEvaConfigDraft } from "./_evaConfig/config";
import { findSnapshotForRepo } from "./_repoSnapshots/config";

/**
 * Per-repo values baked into the served skill content. Runtime fields come from
 * the scoped repo row (the app being worked on in a monorepo); the base branch
 * comes from the canonical codebase.
 */
async function buildHydration(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
  skillName: SystemSkillName,
): Promise<SystemSkillHydration | null> {
  const repo = await db.get(repoId);
  if (!repo) return null;

  const canonicalId = await resolveCanonicalRepoId(db, repoId);
  const canonical = canonicalId === repoId ? repo : await db.get(canonicalId);

  return {
    owner: repo.owner,
    name: repo.name,
    rootDirectory: repo.rootDirectory,
    devPort: repo.devPort,
    devCommand: repo.devCommand,
    startupCommands: repo.startupCommands,
    baseBranch:
      canonical?.defaultBaseBranch ??
      repo.defaultBaseBranch ??
      FALLBACK_GIT_BASE_BRANCH,
    ...(skillName === "eva-setup"
      ? { evaConfigDraft: await buildDraftFromConvex(db, repo) }
      : {}),
  };
}

/** Today's Convex commands for every app of the GitHub repo, as a draft file. */
async function buildDraftFromConvex(
  db: GenericDatabaseReader<DataModel>,
  repo: Doc<"githubRepos">,
): Promise<string> {
  const siblings = await db
    .query("githubRepos")
    .withIndex("by_owner_and_name", (q) =>
      q.eq("owner", repo.owner).eq("name", repo.name),
    )
    .collect();
  // The monorepo root row is not an app unless it is the only row.
  const parentIds = new Set(siblings.map((row) => row.parentRepoId));
  const apps =
    siblings.length > 1
      ? siblings.filter((row) => !parentIds.has(row._id))
      : siblings;
  const drafts = [];
  for (const app of apps) {
    const snapshot = await findSnapshotForRepo(db, app._id);
    drafts.push({
      ...app,
      buildCommands: snapshot?.buildCommands,
      seedCommands: snapshot?.seedCommands,
    });
  }
  return buildEvaConfigDraft(drafts);
}

function isAlwaysInstalled(name: SystemSkillName): boolean {
  return SYSTEM_SKILLS[name].alwaysInstalled === true;
}

async function isInstalled(
  db: GenericDatabaseReader<DataModel>,
  canonicalRepoId: Id<"githubRepos">,
  name: string,
): Promise<boolean> {
  const row = await db
    .query("repoSystemSkills")
    .withIndex("by_repo_and_name", (q) =>
      q.eq("repoId", canonicalRepoId).eq("name", name),
    )
    .first();
  return row !== null;
}

/** Every Eva system skill, with whether this repo has installed it. */
export const listForRepo = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(
    v.object({
      name: v.string(),
      description: v.string(),
      installed: v.boolean(),
      alwaysInstalled: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return [];
    }
    const canonicalId = await resolveCanonicalRepoId(ctx.db, args.repoId);
    const installed = await ctx.db
      .query("repoSystemSkills")
      .withIndex("by_repo", (q) => q.eq("repoId", canonicalId))
      .collect();
    const installedNames = new Set(installed.map((row) => row.name));

    return listSystemSkills().map((definition) => ({
      name: definition.name,
      description: definition.description,
      installed:
        isAlwaysInstalled(definition.name) ||
        installedNames.has(definition.name),
      alwaysInstalled: isAlwaysInstalled(definition.name),
    }));
  },
});

/** Hydrated skill content for the settings viewer (lazy-loaded). */
export const getContentByName = authQuery({
  args: { repoId: v.id("githubRepos"), name: v.string() },
  returns: v.union(v.null(), v.object({ name: v.string(), content: v.string() })),
  handler: async (ctx, args) => {
    if (!isSystemSkillName(args.name)) return null;
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return null;

    const hydration = await buildHydration(ctx.db, args.repoId, args.name);
    if (!hydration) return null;

    const definition = SYSTEM_SKILLS[args.name];
    return { name: definition.name, content: definition.buildContent(hydration) };
  },
});

export const install = authMutation({
  args: { repoId: v.id("githubRepos"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!isSystemSkillName(args.name)) {
      throw new Error(`Unknown system skill "${args.name}"`);
    }
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const canonicalId = await resolveCanonicalRepoId(ctx.db, args.repoId);
    if (await isInstalled(ctx.db, canonicalId, args.name)) return null;

    await ctx.db.insert("repoSystemSkills", {
      repoId: canonicalId,
      name: args.name,
      installedBy: ctx.userId,
      installedAt: Date.now(),
    });
    return null;
  },
});

export const uninstall = authMutation({
  args: { repoId: v.id("githubRepos"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const canonicalId = await resolveCanonicalRepoId(ctx.db, args.repoId);
    const row = await ctx.db
      .query("repoSystemSkills")
      .withIndex("by_repo_and_name", (q) =>
        q.eq("repoId", canonicalId).eq("name", args.name),
      )
      .first();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

/**
 * Stub SKILL.md files to materialize into the sandbox checkout for this launch.
 * The stubs carry no instructions — the agent fetches those via `get_skill`.
 */
export const listStubsForLaunch = internalQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(v.object({ name: v.string(), stub: v.string() })),
  handler: async (ctx, args) => {
    const canonicalId = await resolveCanonicalRepoId(ctx.db, args.repoId);
    const installed = await ctx.db
      .query("repoSystemSkills")
      .withIndex("by_repo", (q) => q.eq("repoId", canonicalId))
      .collect();

    const names = new Set(
      listSystemSkills()
        .filter((definition) => isAlwaysInstalled(definition.name))
        .map((definition) => definition.name),
    );
    for (const row of installed) {
      if (isSystemSkillName(row.name)) names.add(row.name);
    }
    return [...names].map((name) => ({
      name,
      stub: buildStubMarkdown(SYSTEM_SKILLS[name]),
    }));
  },
});

/**
 * Resolves the content the `get_skill` MCP tool serves. Install state is the
 * gate: an uninstalled skill returns nothing rather than its instructions.
 */
export const resolveForMcp = internalQuery({
  args: { repoId: v.string(), name: v.string() },
  returns: v.union(
    v.object({ status: v.literal("ok"), content: v.string() }),
    v.object({ status: v.literal("not_installed") }),
    v.object({ status: v.literal("repo_not_found") }),
  ),
  handler: async (ctx, args) => {
    if (!isSystemSkillName(args.name)) {
      return { status: "not_installed" as const };
    }
    const repoId = ctx.db.normalizeId("githubRepos", args.repoId);
    if (!repoId) return { status: "repo_not_found" as const };

    const canonicalId = await resolveCanonicalRepoId(ctx.db, repoId);
    if (
      !isAlwaysInstalled(args.name) &&
      !(await isInstalled(ctx.db, canonicalId, args.name))
    ) {
      return { status: "not_installed" as const };
    }

    const hydration = await buildHydration(ctx.db, repoId, args.name);
    if (!hydration) return { status: "repo_not_found" as const };

    return {
      status: "ok" as const,
      content: SYSTEM_SKILLS[args.name].buildContent(hydration),
    };
  },
});
