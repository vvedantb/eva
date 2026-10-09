import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { repoSnapshotFields, snapshotScheduleValidator } from "../validators";
import { authQuery, authMutation, getRepoWithAccess } from "../functions";
import { safeDeleteCron, safeReplaceCron } from "../cronManager";
import { findReposByOwnerAndName } from "../_githubRepos/helpers";

/** Converts a schedule string to a cron expression, returning null for "manual". */
function resolveCronspec(schedule: string): string | null {
  if (schedule === "manual") return null;
  return schedule;
}

/** Finds a snapshot config for a repo (app-scoped model with backward compat fallback). */
export async function findSnapshotForRepo(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<Doc<"repoSnapshots"> | null> {
  // First priority: app-specific config (new per-app model)
  const appSpecific = await db
    .query("repoSnapshots")
    .withIndex("by_repo", (q) => q.eq("repoId", repoId))
    .first();
  if (appSpecific) return appSpecific;

  // Fallback (backward compat): if this is an app repo without its own config,
  // check if a shared root config exists and return it.
  // This allows existing monorepo-scoped configs to keep working while we migrate to per-app.
  const repo = await db.get(repoId);
  if (!repo) return null;

  const siblings = await findReposByOwnerAndName(db, repo);

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
      ...repoSnapshotFields,
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
  args: { repoId: v.id("githubRepos") },
  returns: v.union(v.object({ snapshotName: v.string() }), v.null()),
  handler: async (ctx, args) => {
    // Per-app seeded snapshot takes precedence (fast start with seeded DB).
    const repo = await ctx.db.get(args.repoId);
    if (repo?.seededSnapshotName) {
      return { snapshotName: repo.seededSnapshotName };
    }

    const snapshot = await findSnapshotForRepo(ctx.db, args.repoId);
    if (!snapshot) return null;

    // Vercel base Image (`snap_*`) — written by the provider-aware rebuild path.
    if (snapshot.baseSnapshotId) {
      return { snapshotName: snapshot.baseSnapshotId };
    }

    const latestSuccessfulBuild = await ctx.db
      .query("snapshotBuilds")
      .withIndex("by_repo_snapshot_and_status", (q) =>
        q.eq("repoSnapshotId", snapshot._id).eq("status", "success"),
      )
      .order("desc")
      .first();

    if (!latestSuccessfulBuild) return null;
    return { snapshotName: snapshot.snapshotName };
  },
});

/**
 * Lists the app repos a seeded snapshot is built for after the base Image
 * build. Seeded snapshots are PER APP, not per monorepo: an app is a sibling
 * (same owner/name) with stopCommands configured that is NOT the monorepo parent
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
  const siblings = await findReposByOwnerAndName(db, configRepo);
  // Repos that are a monorepo parent of another sibling — skip these.
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

/** Sets (or clears) an app repo's seeded snapshot name (+ input fingerprint). */
export const setSeededSnapshotName = internalMutation({
  args: {
    repoId: v.id("githubRepos"),
    seededSnapshotName: v.union(v.string(), v.null()),
    seededFingerprint: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.repoId, {
      seededSnapshotName: args.seededSnapshotName ?? undefined,
      ...(args.seededFingerprint !== undefined
        ? { seededFingerprint: args.seededFingerprint ?? undefined }
        : {}),
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
      snapshotName: v.string(),
      workflowRef: v.optional(v.string()),
      buildCommands: v.optional(v.array(v.string())),
      seedCommands: v.optional(v.array(v.string())),
      imageFingerprint: v.optional(v.string()),
      baseSnapshotId: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.repoSnapshotId);
    if (!doc) return null;
    return {
      repoId: doc.repoId,
      snapshotName: doc.snapshotName,
      workflowRef: doc.workflowRef,
      buildCommands: doc.buildCommands,
      seedCommands: doc.seedCommands,
      imageFingerprint: doc.imageFingerprint,
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
      if (
        snapConfig?.snapshotName !== undefined &&
        snapConfig.snapshotName.startsWith("snap_")
      ) {
        protectedIds.add(snapConfig.snapshotName);
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
    workflowRef: v.optional(v.string()),
    buildCommands: v.optional(v.array(v.string())),
    seedCommands: v.optional(v.array(v.string())),
  },
  returns: v.id("repoSnapshots"),
  handler: async (ctx, args) => {
    await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    // Check for an app-specific config first (per-app model).
    // During transition, fall back to a shared root config and create an app-scoped row from it.
    const appSpecific = await ctx.db
      .query("repoSnapshots")
      .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
      .first();

    const cronName = `snapshot-rebuild-${args.repoId}`;

    if (appSpecific) {
      // Update the app's own config
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
        workflowRef: args.workflowRef,
        buildCommands: args.buildCommands,
        seedCommands: args.seedCommands,
        updatedAt: Date.now(),
      });
      return appSpecific._id;
    }

    // No app-specific config. For backwards compat, check if a shared root config exists
    // and copy it to this app. This is the lazy-migration path.
    const repo = await ctx.db.get(args.repoId);
    if (repo) {
      const siblings = await findReposByOwnerAndName(ctx.db, repo);

      for (const sibling of siblings) {
        if (sibling._id === args.repoId) continue;
        const siblingSnapshot = await ctx.db
          .query("repoSnapshots")
          .withIndex("by_repo", (q) => q.eq("repoId", sibling._id))
          .first();
        if (siblingSnapshot) {
          // Found a shared root config. Migrate it to this app by creating an app-scoped row.
          const now = Date.now();
          const id = await ctx.db.insert("repoSnapshots", {
            repoId: args.repoId,
            snapshotName: siblingSnapshot.snapshotName,
            schedule: args.schedule,
            enabled: true,
            workflowRef: args.workflowRef,
            buildCommands: args.buildCommands,
            seedCommands: args.seedCommands,
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

    // No shared config found — create a new app-specific row from scratch
    const snapshotName = `snapshot-${args.repoId}`;
    const now = Date.now();
    const id = await ctx.db.insert("repoSnapshots", {
      repoId: args.repoId,
      snapshotName,
      schedule: args.schedule,
      enabled: true,
      workflowRef: args.workflowRef,
      buildCommands: args.buildCommands,
      seedCommands: args.seedCommands,
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

/**
 * Sets a repo's snapshot seed commands directly (internal, CLI/ops use) —
 * mirrors githubRepos:setRepoCommandsInternal for the repoSnapshots row.
 * An empty array clears the field. Fails if the repo has no snapshot config.
 */
export const setSeedCommandsInternal = internalMutation({
  args: {
    repoId: v.id("githubRepos"),
    seedCommands: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("repoSnapshots")
      .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
      .first();
    if (!config) throw new Error("No snapshot config found for this repo");
    await ctx.db.patch(config._id, {
      seedCommands:
        args.seedCommands.length > 0 ? args.seedCommands : undefined,
      updatedAt: Date.now(),
    });
    return null;
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

/** Deletes a snapshot config, its cron job, and the remote sandbox snapshot. */
export const deleteRepoSnapshot = authMutation({
  args: { repoSnapshotId: v.id("repoSnapshots") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.repoSnapshotId);
    if (!config) return null;
    await getRepoWithAccess(ctx.db, config.repoId, ctx.userId);

    const cronName = `snapshot-rebuild-${config.repoId}`;
    await safeDeleteCron(ctx, cronName);

    await ctx.scheduler.runAfter(
      0,
      internal.snapshotActions.deleteSeededSnapshot,
      { snapshotName: config.snapshotName, repoId: config.repoId },
    );

    await ctx.db.delete(args.repoSnapshotId);
    return null;
  },
});
