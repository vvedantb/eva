import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { snapshotScheduleValidator } from "../validators";
import { authQuery, authMutation, getRepoWithAccess } from "../functions";
import { safeDeleteCron, safeReplaceCron } from "../cronManager";
import { computeSeedFingerprint } from "../_evaConfig/config";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { findSiblingsOf } from "../_githubRepos/helpers";

function resolveCronspec(schedule: string): string | null {
  if (schedule === "manual") return null;
  return schedule;
}

/** Finds a snapshot config for a repo (app-scoped model with backward compat fallback). */
export async function findSnapshotForRepo(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<Doc<"repoSnapshots"> | null> {
  const appSpecific = await db
    .query("repoSnapshots")
    .withIndex("by_repo", (q) => q.eq("repoId", repoId))
    .first();
  if (appSpecific) return appSpecific;

  const repo = await db.get(repoId);
  if (!repo) return null;

  const siblings = await findSiblingsOf(db, repo);

  for (const sibling of siblings) {
    if (sibling._id === repoId) continue;
    const siblingSnapshot = await db
      .query("repoSnapshots")
      .withIndex("by_repo", (q) => q.eq("repoId", sibling._id))
      .first();
    if (siblingSnapshot) return siblingSnapshot;
  }

  return null;
}

/** Retrieves the snapshot configuration for a repo, falling back to sibling repos. */
export const getRepoSnapshot = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.union(
    v.object({
      _id: v.id("repoSnapshots"),
      _creationTime: v.number(),
      repoId: v.id("githubRepos"),
      schedule: snapshotScheduleValidator,
      enabled: v.optional(v.boolean()),
      cronJobId: v.optional(v.string()),
      buildCommands: v.optional(v.array(v.string())),
      seedCommands: v.optional(v.array(v.string())),
      baseSnapshotId: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    return await findSnapshotForRepo(ctx.db, args.repoId);
  },
});

/**
 * Returns the snapshot name a sandbox for this repo should boot from.
 * Prefers the app's own seeded running-sandbox snapshot (DB already seeded) when
 * present; otherwise falls back to the shared base Image snapshot, but only if a
 * successful Image build exists.
 */
export const getRepoSnapshotName = internalQuery({
  args: {
    repoId: v.id("githubRepos"),
    skipSeeded: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({
      snapshotName: v.string(),
      seededFingerprint: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const repo = await ctx.db.get(args.repoId);
    if (repo?.seededSnapshotName && args.skipSeeded !== true) {
      return {
        snapshotName: repo.seededSnapshotName,
        seededFingerprint: repo.seededFingerprint,
      };
    }

    const snapshot = await findSnapshotForRepo(ctx.db, args.repoId);
    if (!snapshot) return null;

    return snapshot.baseSnapshotId
      ? { snapshotName: snapshot.baseSnapshotId }
      : null;
  },
});

/**
 * Lists the app repos a seeded snapshot is built for after the base Image
 * build. Seeded snapshots are PER APP, not per monorepo: an app is a sibling
 * (same owner/name and team) with stopCommands configured that is NOT the monorepo parent
 * (i.e. no other sibling points to it via parentRepoId). For a single-app repo
 * the lone repo qualifies (it parents nobody). Returns the full repo docs so
 * callers can read display fields / seededSnapshotName.
 */
export async function findSeedableAppRepos(
  db: GenericDatabaseReader<DataModel>,
  repoSnapshotId: Id<"repoSnapshots">,
): Promise<Doc<"githubRepos">[]> {
  const config = await db.get(repoSnapshotId);
  if (!config) return [];
  const configRepo = await db.get(config.repoId);
  if (!configRepo) return [];
  const siblings = await findSiblingsOf(db, configRepo);
  const parentIds = new Set<Id<"githubRepos">>();
  for (const r of siblings) {
    if (r.parentRepoId) parentIds.add(r.parentRepoId);
  }
  return siblings.filter(
    (r) => (r.stopCommands?.length ?? 0) > 0 && !parentIds.has(r._id),
  );
}

/**
 * Current per-app seeded-snapshot state for a snapshot config: each seedable app
 * with its live seededSnapshotName (null = falling back to the base Image).
 * Used by the snapshot status tab.
 */
export const getSeededAppStatus = authQuery({
  args: { repoSnapshotId: v.id("repoSnapshots") },
  returns: v.array(
    v.object({
      repoId: v.id("githubRepos"),
      app: v.optional(v.string()),
      owner: v.string(),
      name: v.string(),
      seededSnapshotName: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.repoSnapshotId);
    if (!config) return [];
    await getRepoWithAccess(ctx.db, config.repoId, ctx.userId);
    const apps = await findSeedableAppRepos(ctx.db, args.repoSnapshotId);
    return apps.map((r) => ({
      repoId: r._id,
      app: r.rootDirectory,
      owner: r.owner,
      name: r.name,
      seededSnapshotName: r.seededSnapshotName ?? null,
    }));
  },
});

async function currentSeedFingerprint(
  db: GenericDatabaseReader<DataModel>,
  repo: Doc<"githubRepos">,
): Promise<string> {
  const snapshot = await findSnapshotForRepo(db, repo._id);
  return computeSeedFingerprint({
    build: snapshot?.buildCommands ?? [],
    seed: snapshot?.seedCommands ?? [],
    background: repo.backgroundCommands ?? [],
    stop: repo.stopCommands ?? [],
  });
}

/** The seed fingerprint of an app's current cached commands. */
export const getCurrentSeedFingerprint = internalQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const repo = await ctx.db.get(args.repoId);
    return repo ? await currentSeedFingerprint(ctx.db, repo) : null;
  },
});

/**
 * Sets (or clears) an app repo's seeded snapshot name and its seed fingerprint.
 * The build passes the fingerprint it read at seed launch, so a `.eva/` push
 * that lands mid-build cannot stamp the old snapshot with the new inputs.
 */
export const setSeededSnapshotName = internalMutation({
  args: {
    repoId: v.id("githubRepos"),
    seededSnapshotName: v.union(v.string(), v.null()),
    seededFingerprint: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const repo = await ctx.db.get(args.repoId);
    if (!repo) return null;
    await ctx.db.patch(args.repoId, {
      seededSnapshotName: args.seededSnapshotName ?? undefined,
      seededFingerprint:
        args.seededSnapshotName === null
          ? undefined
          : (args.seededFingerprint ??
            (await currentSeedFingerprint(ctx.db, repo))),
    });
    return null;
  },
});

/** Internal query to get snapshot config fields needed for rebuild actions. */
export const getRepoSnapshotInternal = internalQuery({
  args: { repoSnapshotId: v.id("repoSnapshots") },
  returns: v.union(
    v.object({
      repoId: v.id("githubRepos"),
      branch: v.string(),
      buildCommands: v.optional(v.array(v.string())),
      seedCommands: v.optional(v.array(v.string())),
      baseSnapshotId: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.repoSnapshotId);
    if (!doc) return null;
    const repo = await ctx.db.get(doc.repoId);
    return {
      repoId: doc.repoId,
      branch: repo?.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH,
      buildCommands: doc.buildCommands,
      seedCommands: doc.seedCommands,
      baseSnapshotId: doc.baseSnapshotId,
    };
  },
});

/** Union of seeded / base snap ids across every github repo (project-wide purge). */
export const listAllProtectedSnapshotIds = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const protectedIds = new Set<string>();
    const repos = await ctx.db.query("githubRepos").collect();
    for (const repo of repos) {
      if (repo.seededSnapshotName !== undefined) {
        protectedIds.add(repo.seededSnapshotName);
      }
      const snapConfig = await ctx.db
        .query("repoSnapshots")
        .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
        .first();
      if (snapConfig?.baseSnapshotId !== undefined) {
        protectedIds.add(snapConfig.baseSnapshotId);
      }
    }
    return [...protectedIds];
  },
});

/** Stores the Vercel base Image snapshot id (`snap_*`) after a successful capture. */
export const setBaseSnapshotId = internalMutation({
  args: {
    repoSnapshotId: v.id("repoSnapshots"),
    baseSnapshotId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.repoSnapshotId, {
      baseSnapshotId: args.baseSnapshotId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Creates or updates a snapshot config for a repo (app-specific), managing the cron job. */
export const saveRepoSnapshot = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    schedule: snapshotScheduleValidator,
  },
  returns: v.id("repoSnapshots"),
  handler: async (ctx, args) => {
    await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    await ctx.scheduler.runAfter(0, internal._evaConfig.sync.syncEvaConfig, {
      repoId: args.repoId,
    });
    const appSpecific = await ctx.db
      .query("repoSnapshots")
      .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
      .first();

    const cronName = `snapshot-rebuild-${args.repoId}`;

    if (appSpecific) {
      const cronspec = resolveCronspec(args.schedule);
      const cronJobId = await safeReplaceCron(ctx, {
        name: cronName,
        cronspec: cronspec && appSpecific.enabled === true ? cronspec : null,
        handler: internal.repoSnapshots.triggerScheduledBuild,
        args: { repoSnapshotId: appSpecific._id },
      });

      await ctx.db.patch(appSpecific._id, {
        schedule: args.schedule,
        cronJobId,
        updatedAt: Date.now(),
      });
      return appSpecific._id;
    }

    const repo = await ctx.db.get(args.repoId);
    if (repo) {
      const siblings = await findSiblingsOf(ctx.db, repo);

      for (const sibling of siblings) {
        if (sibling._id === args.repoId) continue;
        const siblingSnapshot = await ctx.db
          .query("repoSnapshots")
          .withIndex("by_repo", (q) => q.eq("repoId", sibling._id))
          .first();
        if (siblingSnapshot) {
          const now = Date.now();
          const id = await ctx.db.insert("repoSnapshots", {
            repoId: args.repoId,
            schedule: args.schedule,
            enabled: true,
                baseSnapshotId: siblingSnapshot.baseSnapshotId,
            createdAt: now,
            updatedAt: now,
          });

          const cronJobId = await safeReplaceCron(ctx, {
            name: cronName,
            cronspec: resolveCronspec(args.schedule),
            handler: internal.repoSnapshots.triggerScheduledBuild,
            args: { repoSnapshotId: id },
          });
          if (cronJobId) {
            await ctx.db.patch(id, { cronJobId });
          }
          return id;
        }
      }
    }

    const now = Date.now();
    const id = await ctx.db.insert("repoSnapshots", {
      repoId: args.repoId,
      schedule: args.schedule,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    const cronJobId = await safeReplaceCron(ctx, {
      name: cronName,
      cronspec: resolveCronspec(args.schedule),
      handler: internal.repoSnapshots.triggerScheduledBuild,
      args: { repoSnapshotId: id },
    });
    if (cronJobId) {
      await ctx.db.patch(id, { cronJobId });
    }

    return id;
  },
});


/** Toggles the enabled state of a snapshot, registering or deleting the cron job. */
export const setSnapshotEnabled = authMutation({
  args: {
    repoSnapshotId: v.id("repoSnapshots"),
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.repoSnapshotId);
    if (!config) throw new Error("Snapshot config not found");
    await getRepoWithAccess(ctx.db, config.repoId, ctx.userId);

    const cronName = `snapshot-rebuild-${config.repoId}`;
    const cronJobId = await safeReplaceCron(ctx, {
      name: cronName,
      cronspec: args.enabled ? resolveCronspec(config.schedule) : null,
      handler: internal.repoSnapshots.triggerScheduledBuild,
      args: { repoSnapshotId: config._id },
    });

    await ctx.db.patch(args.repoSnapshotId, {
      enabled: args.enabled,
      cronJobId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Deletes a snapshot config and its cron job. */
export const deleteRepoSnapshot = authMutation({
  args: { repoSnapshotId: v.id("repoSnapshots") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.repoSnapshotId);
    if (!config) return null;
    await getRepoWithAccess(ctx.db, config.repoId, ctx.userId);

    const cronName = `snapshot-rebuild-${config.repoId}`;
    await safeDeleteCron(ctx, cronName);

    await ctx.db.delete(args.repoSnapshotId);
    return null;
  },
});
