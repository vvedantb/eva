import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  snapshotBuildStatusValidator,
  sandboxProviderKindValidator,
  seededAppStatusValidator,
  snapshotBuildFields,
} from "../validators";
import { authQuery, authMutation, getRepoWithAccess } from "../functions";
import { rejectSandboxCaller } from "../_auth/sandboxIdentity";
import { workflow, cancelTrackedWorkflow } from "../workflowManager";
import { sanitizeSeededApps } from "./sanitizeSeededApps";

/** Full snapshot build doc as returned to the client (provider always resolved). */
const snapshotBuildReturnValidator = v.object({
  _id: v.id("snapshotBuilds"),
  _creationTime: v.number(),
  ...snapshotBuildFields,
  provider: sandboxProviderKindValidator,
});

const STALE_BUILD_MS = 30 * 60 * 1000;
const MAX_CRON_RETRIES = 2;

/**
 * Resolves whether a build seeds a DB or only rebuilds the base Image.
 * An app seeds iff it has Stop Commands; otherwise the workflow can only
 * rebuild the base Image. forceImageRebuild does not change this — it just
 * refreshes the base before the same seed path runs.
 */
async function resolveBuildKind(
  ctx: {
    db: { get: (id: Id<"githubRepos">) => Promise<Doc<"githubRepos"> | null> };
  },
  repoId: Id<"githubRepos">,
): Promise<"base" | "seeded"> {
  const repo = await ctx.db.get(repoId);
  return (repo?.stopCommands?.length ?? 0) > 0 ? "seeded" : "base";
}

/**
 * If a build is currently running for a snapshot, either expire it (when stale)
 * or report it as blocking. Returns true only when a non-stale build is still
 * running, in which case the caller must not start a new build.
 */
async function expireStaleBuild(
  ctx: MutationCtx,
  runningBuild: Doc<"snapshotBuilds"> | null,
): Promise<boolean> {
  if (!runningBuild || runningBuild.status !== "running") return false;
  if (Date.now() - runningBuild.startedAt > STALE_BUILD_MS) {
    await ctx.db.patch(runningBuild._id, {
      status: "error",
      error: "Build timed out (exceeded 20 minutes)",
      completedAt: Date.now(),
    });
    return false;
  }
  return true;
}

function sanitizeBuildForReturn(build: Doc<"snapshotBuilds">) {
  return {
    ...build,
    seededApps: sanitizeSeededApps(build.seededApps),
  };
}

/**
 * Provider for display: persisted on the build when possible. Legacy rows and
 * builds still running infer from log markers (env vars are encrypted and
 * cannot be read in query handlers).
 */
function resolveBuildProvider(_build: Doc<"snapshotBuilds">): "vercel" {
  return "vercel";
}

/** Persists the sandbox provider at workflow start (requires action to decrypt env). */
export const setBuildProvider = internalMutation({
  args: {
    buildId: v.id("snapshotBuilds"),
    provider: sandboxProviderKindValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const build = await ctx.db.get(args.buildId);
    if (!build) return null;
    await ctx.db.patch(args.buildId, { provider: args.provider });
    return null;
  },
});

/** Lists the most recent 20 snapshot builds for a given snapshot config. */
export const listBuilds = authQuery({
  args: { repoSnapshotId: v.id("repoSnapshots") },
  returns: v.array(snapshotBuildReturnValidator),
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.repoSnapshotId);
    if (!config) throw new Error("Snapshot config not found");
    await getRepoWithAccess(ctx.db, config.repoId, ctx.userId);
    const builds = await ctx.db
      .query("snapshotBuilds")
      .withIndex("by_repo_snapshot", (q) =>
        q.eq("repoSnapshotId", args.repoSnapshotId),
      )
      .order("desc")
      .take(20);
    return builds.map((build) => ({
      ...sanitizeBuildForReturn(build),
      provider: resolveBuildProvider(build),
    }));
  },
});

/** Retrieves a single snapshot build by ID. */
export const getBuild = authQuery({
  args: { buildId: v.id("snapshotBuilds") },
  returns: v.union(snapshotBuildReturnValidator, v.null()),
  handler: async (ctx, args) => {
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      return null;
    }
    const config = await ctx.db.get(build.repoSnapshotId);
    if (!config) return null;
    await getRepoWithAccess(ctx.db, config.repoId, ctx.userId);
    return {
      ...sanitizeBuildForReturn(build),
      provider: resolveBuildProvider(build),
    };
  },
});

/** Returns just the build status, used by the safety-net poller to avoid double-completing. */
export const getBuildStatus = internalQuery({
  args: { buildId: v.id("snapshotBuilds") },
  returns: v.union(snapshotBuildStatusValidator, v.null()),
  handler: async (ctx, args) => {
    const build = await ctx.db.get(args.buildId);
    if (!build) return null;
    return build.status;
  },
});

/** Cron-triggered handler that starts a new snapshot build if none is currently running. */
export const triggerScheduledBuild = internalMutation({
  args: {
    repoSnapshotId: v.id("repoSnapshots"),
    // For operational debugging: keep the existing cron entry point but record
    // the build as manual so completeBuild does not enqueue cron retries.
    disableRetries: v.optional(v.boolean()),
    forceImageRebuild: v.optional(v.boolean()),
    forceBaseSeed: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.repoSnapshotId);
    if (!config) return null;

    const runningBuild = await ctx.db
      .query("snapshotBuilds")
      .withIndex("by_repo_snapshot", (q) =>
        q.eq("repoSnapshotId", args.repoSnapshotId),
      )
      .order("desc")
      .first();

    if (await expireStaleBuild(ctx, runningBuild)) return null;

    const now = Date.now();
    const kind = await resolveBuildKind(ctx, config.repoId);
    const buildId = await ctx.db.insert("snapshotBuilds", {
      repoSnapshotId: args.repoSnapshotId,
      status: "running",
      triggeredBy: args.disableRetries === true ? "manual" : "cron",
      kind,
      logs: "",
      startedAt: now,
    });

    const workflowId = await workflow.start(
      ctx,
      internal.snapshotWorkflow.snapshotBuildWorkflow,
      {
        buildId,
        repoSnapshotId: args.repoSnapshotId,
        forceImageRebuild: args.forceImageRebuild,
        forceBaseSeed: args.forceBaseSeed,
      },
    );
    await ctx.db.patch(buildId, { workflowId });

    return null;
  },
});

/**
 * Internal: all sandbox ids with a real product owner. Credential-helper rows
 * are intentionally excluded: they are implementation detail rows created for
 * every sandbox, including leaked seed-prep sandboxes.
 */
export const listReferencedSandboxIds = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const ids: string[] = [];
    const add = (sandboxId: string | undefined): void => {
      if (sandboxId && !ids.includes(sandboxId)) ids.push(sandboxId);
    };

    const tasks = await ctx.db.query("agentTasks").collect();
    for (const task of tasks) add(task.sandboxId);

    const runs = await ctx.db.query("agentRuns").collect();
    for (const run of runs) add(run.sandboxId);

    const sessions = await ctx.db.query("sessions").collect();
    for (const session of sessions) add(session.sandboxId);

    const projects = await ctx.db.query("projects").collect();
    for (const project of projects) add(project.sandboxId);

    const docs = await ctx.db.query("docs").collect();
    for (const doc of docs) add(doc.sandboxId);

    const automationRuns = await ctx.db.query("automationRuns").collect();
    for (const run of automationRuns) add(run.sandboxId);

    return ids;
  },
});

/** Manually starts a new snapshot build, failing if one is already running. */
export const startBuild = authMutation({
  args: {
    repoSnapshotId: v.id("repoSnapshots"),
    /** App repo that triggered the build (for shared monorepo snapshot configs). */
    appRepoId: v.optional(v.id("githubRepos")),
  },
  returns: v.id("snapshotBuilds"),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const sharedConfig = await ctx.db.get(args.repoSnapshotId);
    if (!sharedConfig) throw new Error("Snapshot config not found");
    await getRepoWithAccess(ctx.db, sharedConfig.repoId, ctx.userId);

    // Lazy-migrate shared monorepo configs onto the triggering app so
    // eprocurement builds don't share history / baseSnapshotId with apps/web.
    let config = sharedConfig;
    const effectiveAppRepoId = args.appRepoId ?? sharedConfig.repoId;
    await getRepoWithAccess(ctx.db, effectiveAppRepoId, ctx.userId);
    if (effectiveAppRepoId !== sharedConfig.repoId) {
      const appSpecific = await ctx.db
        .query("repoSnapshots")
        .withIndex("by_repo", (q) => q.eq("repoId", effectiveAppRepoId))
        .first();
      if (appSpecific) {
        config = appSpecific;
      } else {
        const now = Date.now();
        const id = await ctx.db.insert("repoSnapshots", {
          repoId: effectiveAppRepoId,
          snapshotName: `snapshot-${effectiveAppRepoId}`,
          schedule: sharedConfig.schedule,
          enabled: sharedConfig.enabled ?? true,
          workflowRef: sharedConfig.workflowRef,
          buildCommands: sharedConfig.buildCommands,
          seedCommands: sharedConfig.seedCommands,
          // Do not copy baseSnapshotId — that may be another app's Vercel snap.
          createdAt: now,
          updatedAt: now,
        });
        const created = await ctx.db.get(id);
        if (!created) throw new Error("Failed to create app snapshot config");
        config = created;
      }
    }

    const runningBuild = await ctx.db
      .query("snapshotBuilds")
      .withIndex("by_repo_snapshot", (q) => q.eq("repoSnapshotId", config._id))
      .order("desc")
      .first();

    if (await expireStaleBuild(ctx, runningBuild)) {
      throw new Error("A build is already running for this snapshot");
    }

    const now = Date.now();
    const kind = await resolveBuildKind(ctx, effectiveAppRepoId);
    const buildId = await ctx.db.insert("snapshotBuilds", {
      repoSnapshotId: config._id,
      status: "running",
      triggeredBy: "manual",
      kind,
      logs: "",
      startedAt: now,
    });

    const workflowId = await workflow.start(
      ctx,
      internal.snapshotWorkflow.snapshotBuildWorkflow,
      {
        buildId,
        repoSnapshotId: config._id,
        appRepoId: effectiveAppRepoId,
      },
    );
    await ctx.db.patch(buildId, { workflowId });

    return buildId;
  },
});

/**
 * Internal entry for ops / agent loops: start a snapshot build for a specific
 * app repo (creates a per-app config from a shared monorepo config if needed).
 */
export const startBuildForRepo = internalMutation({
  args: { repoId: v.id("githubRepos") },
  returns: v.id("snapshotBuilds"),
  handler: async (ctx, args) => {
    const appSpecific = await ctx.db
      .query("repoSnapshots")
      .withIndex("by_repo", (q) => q.eq("repoId", args.repoId))
      .first();

    let repoSnapshotId = appSpecific?._id;
    if (!repoSnapshotId) {
      const repo = await ctx.db.get(args.repoId);
      if (!repo) throw new Error("Repo not found");
      const siblings = await ctx.db
        .query("githubRepos")
        .withIndex("by_owner_and_name", (q) =>
          q.eq("owner", repo.owner).eq("name", repo.name),
        )
        .collect();
      let shared: Doc<"repoSnapshots"> | null = null;
      for (const sibling of siblings) {
        if (sibling._id === args.repoId) continue;
        const siblingSnapshot = await ctx.db
          .query("repoSnapshots")
          .withIndex("by_repo", (q) => q.eq("repoId", sibling._id))
          .first();
        if (siblingSnapshot) {
          shared = siblingSnapshot;
          break;
        }
      }
      if (!shared) throw new Error("No snapshot config found for this repo");
      const now = Date.now();
      repoSnapshotId = await ctx.db.insert("repoSnapshots", {
        repoId: args.repoId,
        snapshotName: `snapshot-${args.repoId}`,
        schedule: shared.schedule,
        enabled: shared.enabled ?? true,
        workflowRef: shared.workflowRef,
        buildCommands: shared.buildCommands,
        seedCommands: shared.seedCommands,
        createdAt: now,
        updatedAt: now,
      });
    }

    const runningBuild = await ctx.db
      .query("snapshotBuilds")
      .withIndex("by_repo_snapshot", (q) =>
        q.eq("repoSnapshotId", repoSnapshotId),
      )
      .order("desc")
      .first();
    if (await expireStaleBuild(ctx, runningBuild)) {
      throw new Error("A build is already running for this snapshot");
    }

    const now = Date.now();
    const kind = await resolveBuildKind(ctx, args.repoId);
    const buildId = await ctx.db.insert("snapshotBuilds", {
      repoSnapshotId,
      status: "running",
      triggeredBy: "manual",
      kind,
      logs: "",
      startedAt: now,
    });

    const workflowId = await workflow.start(
      ctx,
      internal.snapshotWorkflow.snapshotBuildWorkflow,
      {
        buildId,
        repoSnapshotId,
        appRepoId: args.repoId,
      },
    );
    await ctx.db.patch(buildId, { workflowId });

    return buildId;
  },
});

/** Marks a build as complete (success/error); retries on cron failure. */
export const completeBuild = internalMutation({
  args: {
    buildId: v.id("snapshotBuilds"),
    status: snapshotBuildStatusValidator,
    logs: v.string(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const build = await ctx.db.get(args.buildId);
    if (!build) return null;

    // Guard: prevent double-completion from concurrent workflow steps
    if (build.status !== "running") return null;

    await ctx.db.patch(args.buildId, {
      status: args.status,
      logs: build.logs + args.logs,
      error: args.error,
      completedAt: Date.now(),
    });
    if (
      args.status === "error" &&
      build.triggeredBy === "cron" &&
      (build.retryCount ?? 0) < MAX_CRON_RETRIES
    ) {
      const retryCount = (build.retryCount ?? 0) + 1;
      const now = Date.now();
      const retryBuildId = await ctx.db.insert("snapshotBuilds", {
        repoSnapshotId: build.repoSnapshotId,
        status: "running",
        triggeredBy: "cron",
        kind: build.kind,
        provider: build.provider,
        logs: `Retry ${retryCount}/${MAX_CRON_RETRIES} after failure: ${args.error ?? "unknown error"}\n`,
        startedAt: now,
        retryCount,
      });
      const retryWorkflowId = await workflow.start(
        ctx,
        internal.snapshotWorkflow.snapshotBuildWorkflow,
        {
          buildId: retryBuildId,
          repoSnapshotId: build.repoSnapshotId,
        },
      );
      await ctx.db.patch(retryBuildId, { workflowId: retryWorkflowId });
    }
    return null;
  },
});

/**
 * Cancels a running snapshot build: stops the workflow (so sandbox work ends
 * rather than continuing unwatched) and marks the row errored, which also
 * unblocks `startBuild` / `triggerScheduledBuild` before the stale window.
 */
export const cancelBuild = authMutation({
  args: {
    buildId: v.id("snapshotBuilds"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const build = await ctx.db.get(args.buildId);
    if (!build) throw new Error("Build not found");
    const config = await ctx.db.get(build.repoSnapshotId);
    if (!config) throw new Error("Snapshot config not found");
    await getRepoWithAccess(ctx.db, config.repoId, ctx.userId);

    if (build.status !== "running") {
      throw new Error("Build is not running");
    }

    await cancelTrackedWorkflow(ctx, build.workflowId);
    await ctx.db.patch(build._id, {
      status: "error",
      error: "Cancelled by user",
      completedAt: Date.now(),
    });
    return null;
  },
});

/** Appends a log chunk to an existing snapshot build record. */
export const appendLogs = internalMutation({
  args: {
    buildId: v.id("snapshotBuilds"),
    chunk: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const build = await ctx.db.get(args.buildId);
    if (!build) return null;
    await ctx.db.patch(args.buildId, {
      logs: build.logs + args.chunk,
    });
    return null;
  },
});

/**
 * Records a single app's seeding outcome on a build (called during Step 5).
 * seededSnapshotName is the captured snapshot name on success, or null when the
 * app fell back to the base Image. Replaces any prior entry for the same repo so
 * the operation is idempotent under workflow retries.
 */
export const recordSeededApp = internalMutation({
  args: {
    buildId: v.id("snapshotBuilds"),
    repoId: v.id("githubRepos"),
    status: seededAppStatusValidator,
    seededSnapshotName: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const build = await ctx.db.get(args.buildId);
    if (!build) return null;
    const repo = await ctx.db.get(args.repoId);
    const seededApps = [
      ...(build.seededApps ?? []).filter((a) => a.repoId !== args.repoId),
      {
        repoId: args.repoId,
        app: repo?.rootDirectory,
        status: args.status,
        seededSnapshotName: args.seededSnapshotName,
      },
    ];
    await ctx.db.patch(args.buildId, { seededApps });
    return null;
  },
});
