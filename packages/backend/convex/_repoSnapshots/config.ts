import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { snapshotScheduleValidator } from "../validators";
import { authQuery, authMutation, getRepoWithAccess } from "../functions";
import { safeDeleteCron, safeReplaceCron } from "../cronManager";

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

  const siblings = await db
    .query("githubRepos")
    .withIndex("by_owner_and_name", (q) =>
      q.eq("owner", repo.owner).eq("name", repo.name),
    )
    .collect();

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
      snapshotName: v.string(),
      schedule: snapshotScheduleValidator,
      enabled: v.optional(v.boolean()),
      cronJobId: v.optional(v.string()),
      workflowRef: v.optional(v.string()),
      buildCommands: v.optional(v.array(v.string())),
      seedCommands: v.optional(v.array(v.string())),
      imageFingerprint: v.optional(v.string()),
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
 * Lists the app repos a seeded snapshot should be built for after the base Image
 * build. Seeded snapshots are PER APP, not per monorepo: an app is a sibling
 * (same owner/name) with stopCommands configured that is NOT the monorepo parent
 * (i.e. no other sibling points to it via parentRepoId). For a single-app repo
 * the lone repo qualifies (it parents nobody). For carepulse this yields web +
 * eprocurement, excluding the parent root.
 */
/**
 * Shared resolver for the seedable app repos of a snapshot config (see
 * getSeedableAppRepos doc for the rule). Returns the full repo docs so callers
 * can read display fields / seededSnapshotName.
 */
export async function findSeedableAppRepos(
  db: GenericDatabaseReader<DataModel>,
  repoSnapshotId: Id<"repoSnapshots">,
): Promise<Doc<"githubRepos">[]> {
  const config = await db.get(repoSnapshotId);
  if (!config) return [];
  const configRepo = await db.get(config.repoId);
  if (!configRepo) return [];
  const siblings = await db
    .query("githubRepos")
    .withIndex("by_owner_and_name", (q) =>
      q.eq("owner", configRepo.owner).eq("name", configRepo.name),
    )
    .collect();
  // Repos that are a monorepo parent of another sibling — skip these.
  const parentIds = new Set<Id<"githubRepos">>();
  for (const r of siblings) {
    if (r.parentRepoId) parentIds.add(r.parentRepoId);
  }
  return siblings.filter(
    (r) => (r.stopCommands?.length ?? 0) > 0 && !parentIds.has(r._id),
  );
}

export const getSeedableAppRepos = internalQuery({
  args: { repoSnapshotId: v.id("repoSnapshots") },
  returns: v.array(
    v.object({
      repoId: v.id("githubRepos"),
      // Current live seeded snapshot (null when falling back to the Image).
      // The build workflow warm-boots the seed-prep sandbox from this and
      // deletes it only after the replacement capture succeeds.
      seededSnapshotName: v.union(v.string(), v.null()),
      // Seed-input fingerprint stored at the last successful capture — when it
      // still matches the current inputs the workflow skips re-seeding.
      seededFingerprint: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const apps = await findSeedableAppRepos(ctx.db, args.repoSnapshotId);
    return apps.map((r) => ({
      repoId: r._id,
      seededSnapshotName: r.seededSnapshotName ?? null,
      seededFingerprint: r.seededFingerprint ?? null,
    }));
  },
});

/**
 * Siblings that still carry a seededSnapshotName but are NO LONGER seedable
 * (e.g. an app that dropped its stopCommands, or the monorepo parent). The
 * per-app rebuild loop only deletes snapshots for CURRENTLY seedable apps, so
 * without cleanup an ex-seedable app's seeded-<repoId> snapshot lingers
 * forever. The build workflow uses this to delete those snapshots and
 * clear the stale name.
 */
export const getOrphanedSeededApps = internalQuery({
  args: { repoSnapshotId: v.id("repoSnapshots") },
  returns: v.array(
    v.object({
      repoId: v.id("githubRepos"),
      seededSnapshotName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.repoSnapshotId);
    if (!config) return [];
    const configRepo = await ctx.db.get(config.repoId);
    if (!configRepo) return [];
    const siblings = await ctx.db
      .query("githubRepos")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", configRepo.owner).eq("name", configRepo.name),
      )
      .collect();
    const seedable = await findSeedableAppRepos(ctx.db, args.repoSnapshotId);
    const seedableIds = new Set(seedable.map((r) => r._id));
    const orphans: Array<{
      repoId: Id<"githubRepos">;
      seededSnapshotName: string;
    }> = [];
    for (const r of siblings) {
      // The !== undefined guard narrows seededSnapshotName to string.
      if (!seedableIds.has(r._id) && r.seededSnapshotName !== undefined) {
        orphans.push({
          repoId: r._id,
          seededSnapshotName: r.seededSnapshotName,
        });
      }
    }
    return orphans;
  },
});

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
    const snapshot = await ctx.db.get(args.repoSnapshotId);
    if (!snapshot) return [];
    await getRepoWithAccess(ctx.db, snapshot.repoId, ctx.userId);
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

/**
 * Resolves the PRIMARY seed app for a whole-repo seeded snapshot build (see
 * SNAPSHOT_SINGLE_REFACTOR_DESIGN.md). Among the seedable apps (siblings with
 * stopCommands, not the monorepo parent), the primary is the one whose
 * combined startup/background/stop commands need Supabase state capture
 * (owns start-db/supabase/seed:sql) — for carepulse that is apps/web. Falls
 * back to the first seedable app if none match. Returns null when there are
 * no seedable apps at all.
 */
export const getPrimarySeedAppRepo = internalQuery({
  args: { repoSnapshotId: v.id("repoSnapshots") },
  returns: v.union(
    v.object({
      primaryRepoId: v.id("githubRepos"),
      seedableRepoIds: v.array(v.id("githubRepos")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const apps = await findSeedableAppRepos(ctx.db, args.repoSnapshotId);
    if (apps.length === 0) return null;

    const seedableRepoIds = apps.map((r) => r._id);
    let primary = apps.find((r) =>
      shouldCaptureSupabaseState([
        ...(r.startupCommands ?? []),
        ...(r.backgroundCommands ?? []),
        ...(r.stopCommands ?? []),
      ]),
    );
    if (!primary) primary = apps[0];

    return { primaryRepoId: primary._id, seedableRepoIds };
  },
});

/** Mirrors snapshotActions.shouldCaptureSupabaseState — kept local to avoid a "use node" import. */
function shouldCaptureSupabaseState(commands: string[]): boolean {
  return commands.some((command) => {
    const lower = command.toLowerCase();
    return (
      lower.includes("supabase") ||
      lower.includes("start-db") ||
      lower.includes("seed:sql")
    );
  });
}

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

/**
 * Writes the SAME seeded snapshot id to every seedable app repo. Used by the
 * single whole-repo seeded snapshot flow: one snapshot is built (from the
 * primary app) but every seedable app repo's `seededSnapshotName` must point
 * at it so any app can boot from it (getRepoSnapshotName reads this field
 * per-repo at sandbox-create time).
 */
export const setSeededSnapshotNameForAll = internalMutation({
  args: {
    repoIds: v.array(v.id("githubRepos")),
    seededSnapshotName: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const repoId of args.repoIds) {
      await ctx.db.patch(repoId, {
        seededSnapshotName: args.seededSnapshotName ?? undefined,
      });
    }
    return null;
  },
});

/**
 * Fingerprint of an app's seed inputs: its startup/background/stop commands
 * plus the config-file blobs of the app repo and the snapshot config's repo
 * (data.sql / backup zips live on the parent). When this matches the value
 * stored at the last successful seeded capture, the build workflow skips
 * re-seeding: the resulting snapshot's data would be identical, and rebuilding
 * it only contends with the concurrent base-image build on Vercel.
 */
export const getSeedFingerprint = internalQuery({
  args: {
    repoSnapshotId: v.id("repoSnapshots"),
    repoId: v.id("githubRepos"),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const app = await ctx.db.get(args.repoId);
    if (!app) return "missing-repo";
    const config = await ctx.db.get(args.repoSnapshotId);
    const fileKeys = async (repoId: Id<"githubRepos">): Promise<string[]> => {
      const files = await ctx.db
        .query("sandboxConfigFiles")
        .withIndex("by_repo", (q) => q.eq("repoId", repoId))
        .collect();
      return files
        .map(
          (f) =>
            `${f.fileName}:${f.fileSize}:${(f.chunks ?? (f.storageId ? [f.storageId] : [])).join(",")}`,
        )
        .sort();
    };
    const payload = JSON.stringify({
      startup: app.startupCommands ?? [],
      background: app.backgroundCommands ?? [],
      stop: app.stopCommands ?? [],
      appFiles: await fileKeys(args.repoId),
      parentFiles: config ? await fileKeys(config.repoId) : [],
    });
    // djb2 — cheap, deterministic, collision-resistant enough for a
    // change-detection fingerprint (a false match only skips a re-seed).
    let hash = 5381;
    for (let i = 0; i < payload.length; i++) {
      hash = (hash * 33) ^ payload.charCodeAt(i);
    }
    return `fp-${(hash >>> 0).toString(36)}-${payload.length}`;
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

/**
 * snap_* / seeded ids that must survive orphan cleanup for this monorepo
 * (current base Image + per-app seeded captures).
 */
export const listProtectedSnapshotIds = internalQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const repo = await ctx.db.get(args.repoId);
    if (!repo) return [];
    const siblings = await ctx.db
      .query("githubRepos")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", repo.owner).eq("name", repo.name),
      )
      .collect();
    const protectedIds = new Set<string>();
    for (const sibling of siblings) {
      if (sibling.seededSnapshotName !== undefined) {
        protectedIds.add(sibling.seededSnapshotName);
      }
      const snapConfig = await ctx.db
        .query("repoSnapshots")
        .withIndex("by_repo", (q) => q.eq("repoId", sibling._id))
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

/** Stores the image-input fingerprint after a successful Image build. */
export const setImageFingerprint = internalMutation({
  args: {
    repoSnapshotId: v.id("repoSnapshots"),
    imageFingerprint: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.repoSnapshotId, {
      imageFingerprint: args.imageFingerprint ?? undefined,
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
      const siblings = await ctx.db
        .query("githubRepos")
        .withIndex("by_owner_and_name", (q) =>
          q.eq("owner", repo.owner).eq("name", repo.name),
        )
        .collect();

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
