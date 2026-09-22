"use node";

import { v, type Infer } from "convex/values";
import { Snapshot, Sandbox } from "@vercel/sandbox";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { resolveSandboxCredentialsOnly } from "../envVarResolver";
import { getSandboxHandle, ensureSandboxRunning } from "./helpers";
import { unwrapVercelSandbox } from "../_sandbox/vercelProvider";
import {
  KEEP_LAST_SNAPSHOTS,
  SNAPSHOT_TTL_MS,
} from "../_sandbox/vercelSnapshotOptions";

function snapshotStillExpiring(expiresAt: number | null | undefined): boolean {
  if (expiresAt === null || expiresAt === undefined) return false;
  if (expiresAt === 0) return false;
  return true;
}

const snapMetaValidator = v.object({
  id: v.string(),
  status: v.string(),
  expiresAt: v.union(v.number(), v.null()),
  expiresAtPresent: v.boolean(),
  daysUntilExpire: v.union(v.number(), v.null()),
  createdAt: v.number(),
  lastUsedAt: v.union(v.number(), v.null()),
  sizeBytes: v.number(),
  creationMethod: v.union(v.string(), v.null()),
});

const snapshotLookupRowValidator = v.object({
  snapshotId: v.string(),
  found: v.boolean(),
  projectId: v.union(v.string(), v.null()),
  status: v.union(v.string(), v.null()),
  sizeBytes: v.union(v.number(), v.null()),
  expiresAt: v.union(v.number(), v.null()),
  daysUntilExpire: v.union(v.number(), v.null()),
  protectedBySandbox: v.union(v.string(), v.null()),
  deleted: v.boolean(),
  error: v.union(v.string(), v.null()),
});

type SnapshotLookupRow = Infer<typeof snapshotLookupRowValidator>;

/**
 * Diagnostic: dump sandbox retention policy + raw Snapshot.list metas for a
 * few live candidates. Use to interpret bulkUpdateSnapshotRetention counters.
 *
 *   npx convex run sandbox:inspectSnapshotRetention '{"limit":3}'
 *   npx convex run sandbox:inspectSnapshotRetention '{"limit":3,"applyUpdate":true}'
 */
export const inspectSnapshotRetention = internalAction({
  args: {
    limit: v.optional(v.number()),
    applyUpdate: v.optional(v.boolean()),
    /** Also Snapshot.get each deleted tombstone and log sizeBytes (billing signal). */
    probeTombstones: v.optional(v.boolean()),
  },
  returns: v.object({
    samples: v.array(
      v.object({
        kind: v.string(),
        entityId: v.string(),
        sandboxId: v.string(),
        sandboxSnapshotExpiration: v.union(v.number(), v.null()),
        sandboxKeepLast: v.union(
          v.object({
            count: v.number(),
            expiration: v.union(v.number(), v.null()),
            deleteEvicted: v.union(v.boolean(), v.null()),
          }),
          v.null(),
        ),
        snapshots: v.array(snapMetaValidator),
        tombstoneGets: v.array(
          v.object({
            id: v.string(),
            status: v.string(),
            sizeBytes: v.number(),
            expiresAt: v.union(v.number(), v.null()),
          }),
        ),
        anyStillExpiring: v.boolean(),
        error: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 3, 1), 10);
    const applyUpdate = args.applyUpdate === true;
    const probeTombstones = args.probeTombstones === true;
    const now = Date.now();
    const samples: Array<{
      kind: string;
      entityId: string;
      sandboxId: string;
      sandboxSnapshotExpiration: number | null;
      sandboxKeepLast: {
        count: number;
        expiration: number | null;
        deleteEvicted: boolean | null;
      } | null;
      snapshots: Array<{
        id: string;
        status: string;
        expiresAt: number | null;
        expiresAtPresent: boolean;
        daysUntilExpire: number | null;
        createdAt: number;
        lastUsedAt: number | null;
        sizeBytes: number;
        creationMethod: string | null;
      }>;
      tombstoneGets: Array<{
        id: string;
        status: string;
        sizeBytes: number;
        expiresAt: number | null;
      }>;
      anyStillExpiring: boolean;
      error: string | null;
    }> = [];

    let cursor: string | undefined;
    let phase: "sessions" | "projects" | "agentTasks" | undefined;
    while (samples.length < limit) {
      const page = await ctx.runQuery(
        internal.sandboxCleanup.listLiveSandboxCandidates,
        { cursor, phase },
      );
      for (const candidate of page.candidates) {
        if (samples.length >= limit) break;
        try {
          const credentials = await resolveSandboxCredentialsOnly(
            ctx,
            candidate.repoId,
          );
          const handle = await getSandboxHandle(
            ctx,
            candidate.repoId,
            candidate.sandboxId,
          );
          await handle.refresh();
          if (handle.state === "gone" || handle.state === "error") {
            samples.push({
              kind: candidate.kind,
              entityId: candidate.entityId,
              sandboxId: candidate.sandboxId,
              sandboxSnapshotExpiration: null,
              sandboxKeepLast: null,
              snapshots: [],
              tombstoneGets: [],
              anyStillExpiring: false,
              error: `state=${handle.state}`,
            });
            continue;
          }
          const vercel = unwrapVercelSandbox(handle);
          if (applyUpdate) {
            await vercel.update({
              snapshotExpiration: SNAPSHOT_TTL_MS,
              keepLastSnapshots: KEEP_LAST_SNAPSHOTS,
            });
          }
          const keep = vercel.keepLastSnapshots;
          const snaps: (typeof samples)[number]["snapshots"] = [];
          const listed = await Snapshot.list({
            token: credentials.token,
            teamId: credentials.teamId,
            projectId: credentials.projectId,
            name: vercel.name,
          });
          for await (const meta of listed) {
            const expiresAtPresent = "expiresAt" in meta && meta.expiresAt != null;
            const expiresAt =
              expiresAtPresent && typeof meta.expiresAt === "number"
                ? meta.expiresAt
                : null;
            snaps.push({
              id: meta.id,
              status: String(meta.status),
              expiresAt,
              expiresAtPresent,
              daysUntilExpire:
                expiresAt === null
                  ? null
                  : Math.round((expiresAt - now) / (24 * 60 * 60 * 1000)),
              createdAt: meta.createdAt,
              lastUsedAt:
                "lastUsedAt" in meta && typeof meta.lastUsedAt === "number"
                  ? meta.lastUsedAt
                  : null,
              sizeBytes: meta.sizeBytes,
              creationMethod:
                "creationMethod" in meta &&
                typeof meta.creationMethod === "string"
                  ? meta.creationMethod
                  : null,
            });
          }
          const tombstoneGets: (typeof samples)[number]["tombstoneGets"] = [];
          if (probeTombstones) {
            for (const snap of snaps) {
              if (snap.status !== "deleted") continue;
              try {
                const got = await Snapshot.get({
                  token: credentials.token,
                  teamId: credentials.teamId,
                  projectId: credentials.projectId,
                  snapshotId: snap.id,
                });
                const expires =
                  got.expiresAt === undefined || got.expiresAt === null
                    ? null
                    : got.expiresAt.getTime();
                tombstoneGets.push({
                  id: snap.id,
                  status: String(got.status),
                  sizeBytes: got.sizeBytes,
                  expiresAt: expires,
                });
              } catch (err) {
                tombstoneGets.push({
                  id: snap.id,
                  status: `get-failed:${err instanceof Error ? err.message : String(err)}`,
                  sizeBytes: -1,
                  expiresAt: null,
                });
              }
            }
          }
          const sample = {
            kind: candidate.kind,
            entityId: candidate.entityId,
            sandboxId: candidate.sandboxId,
            sandboxSnapshotExpiration:
              typeof vercel.snapshotExpiration === "number"
                ? vercel.snapshotExpiration
                : null,
            sandboxKeepLast:
              keep === undefined
                ? null
                : {
                    count: keep.count,
                    expiration:
                      typeof keep.expiration === "number"
                        ? keep.expiration
                        : null,
                    deleteEvicted:
                      typeof keep.deleteEvicted === "boolean"
                        ? keep.deleteEvicted
                        : null,
                  },
            snapshots: snaps,
            tombstoneGets,
            anyStillExpiring: snaps.some(
              (s) =>
                s.status === "created" && snapshotStillExpiring(s.expiresAt),
            ),
            error: null,
          };
          console.log(
            `[inspectSnapshotRetention] ${JSON.stringify(sample)}`,
          );
          samples.push(sample);
        } catch (err) {
          samples.push({
            kind: candidate.kind,
            entityId: candidate.entityId,
            sandboxId: candidate.sandboxId,
            sandboxSnapshotExpiration: null,
            sandboxKeepLast: null,
            snapshots: [],
            tombstoneGets: [],
            anyStillExpiring: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (page.isDone || page.nextPhase === null) break;
      cursor =
        page.nextPhase === page.phase
          ? (page.continueCursor ?? undefined)
          : undefined;
      phase = page.nextPhase;
    }
    return { samples };
  },
});

type Candidate = {
  kind: "session" | "project" | "agentTask";
  entityId: string;
  sandboxId: string;
  repoId: Id<"githubRepos">;
};

type CandidateResult =
  | { outcome: "cleared" }
  | { outcome: "stillExpiring"; cycled: boolean }
  | { outcome: "skipped" };

/**
 * One-off pass: PATCH live sandboxes to never-expire retention, then read
 * snapshot `expiresAt` back to learn whether the update is retroactive.
 *
 * First run with defaults (cycleIfNeeded false). If logs show still-expiring,
 * re-run with `{ cycleIfNeeded: true }` to mint a fresh snap under the new policy.
 *
 * Candidates in each page are processed in parallel. Cycle path skips Docker
 * bootstrap — start+stop is enough to mint a keep-last-1 snapshot.
 *
 *   npx convex run sandbox:bulkUpdateSnapshotRetention
 *   npx convex run sandbox:bulkUpdateSnapshotRetention '{"cycleIfNeeded":true}'
 */
export const bulkUpdateSnapshotRetention = internalAction({
  args: {
    cursor: v.optional(v.string()),
    phase: v.optional(
      v.union(
        v.literal("sessions"),
        v.literal("projects"),
        v.literal("agentTasks"),
      ),
    ),
    cycleIfNeeded: v.optional(v.boolean()),
    cleared: v.optional(v.number()),
    stillExpiring: v.optional(v.number()),
    skipped: v.optional(v.number()),
    cycled: v.optional(v.number()),
  },
  returns: v.object({
    cleared: v.number(),
    stillExpiring: v.number(),
    skipped: v.number(),
    cycled: v.number(),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const cycleIfNeeded = args.cycleIfNeeded === true;
    let cleared = args.cleared ?? 0;
    let stillExpiring = args.stillExpiring ?? 0;
    let skipped = args.skipped ?? 0;
    let cycled = args.cycled ?? 0;

    const page = await ctx.runQuery(
      internal.sandboxCleanup.listLiveSandboxCandidates,
      {
        cursor: args.cursor,
        phase: args.phase,
      },
    );

    const processOne = async (
      candidate: Candidate,
    ): Promise<CandidateResult> => {
      try {
        const credentials = await resolveSandboxCredentialsOnly(
          ctx,
          candidate.repoId,
        );
        const handle = await getSandboxHandle(
          ctx,
          candidate.repoId,
          candidate.sandboxId,
        );
        try {
          await handle.refresh();
        } catch (refreshErr) {
          console.log(
            `[bulkUpdateSnapshotRetention] skip gone ${candidate.kind}=${candidate.entityId} sandbox=${candidate.sandboxId}: ${refreshErr instanceof Error ? refreshErr.message : String(refreshErr)}`,
          );
          return { outcome: "skipped" };
        }
        if (handle.state === "gone" || handle.state === "error") {
          console.log(
            `[bulkUpdateSnapshotRetention] skip state=${handle.state} ${candidate.kind}=${candidate.entityId} sandbox=${candidate.sandboxId}`,
          );
          return { outcome: "skipped" };
        }

        const vercel = unwrapVercelSandbox(handle);
        await vercel.update({
          snapshotExpiration: SNAPSHOT_TTL_MS,
          keepLastSnapshots: KEEP_LAST_SNAPSHOTS,
        });

        let anyExpiring = false;
        const listed = await Snapshot.list({
          token: credentials.token,
          teamId: credentials.teamId,
          projectId: credentials.projectId,
          name: vercel.name,
        });
        for await (const meta of listed) {
          // keep-last soft-deletes leave tombstones in list() with the old
          // expiresAt — only live snaps matter for retention.
          if (String(meta.status) !== "created") continue;
          const expiresAt =
            "expiresAt" in meta && typeof meta.expiresAt === "number"
              ? meta.expiresAt
              : null;
          if (snapshotStillExpiring(expiresAt)) {
            anyExpiring = true;
          }
        }

        if (!anyExpiring) {
          console.log(
            `[bulkUpdateSnapshotRetention] retroactive: cleared ${candidate.kind}=${candidate.entityId} sandbox=${candidate.sandboxId}`,
          );
          return { outcome: "cleared" };
        }

        console.log(
          `[bulkUpdateSnapshotRetention] still-expiring ${candidate.kind}=${candidate.entityId} sandbox=${candidate.sandboxId}`,
        );

        if (!cycleIfNeeded) {
          return { outcome: "stillExpiring", cycled: false };
        }

        // Mint a fresh snapshot under the new policy; keep-last-1 evicts old.
        // No Docker / exec probe — we only need a successful start+stop.
        await ensureSandboxRunning(handle, {
          timeoutSeconds: 120,
          resumeAfterStop: true,
          skipDocker: true,
          skipExecProbe: true,
        });
        await handle.stop();
        console.log(
          `[bulkUpdateSnapshotRetention] cycled ${candidate.kind}=${candidate.entityId} sandbox=${candidate.sandboxId}`,
        );
        return { outcome: "stillExpiring", cycled: true };
      } catch (err) {
        console.warn(
          `[bulkUpdateSnapshotRetention] failed ${candidate.kind}=${candidate.entityId} sandbox=${candidate.sandboxId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return { outcome: "skipped" };
      }
    };

    const results = await Promise.all(
      page.candidates.map((candidate) => processOne(candidate)),
    );
    for (const result of results) {
      if (result.outcome === "cleared") cleared += 1;
      else if (result.outcome === "skipped") skipped += 1;
      else {
        stillExpiring += 1;
        if (result.cycled) cycled += 1;
      }
    }

    if (!page.isDone && page.nextPhase !== null) {
      await ctx.scheduler.runAfter(
        0,
        internal.sandbox.bulkUpdateSnapshotRetention,
        {
          cursor:
            page.nextPhase === page.phase
              ? (page.continueCursor ?? undefined)
              : undefined,
          phase: page.nextPhase,
          cycleIfNeeded,
          cleared,
          stillExpiring,
          skipped,
          cycled,
        },
      );
      return { cleared, stillExpiring, skipped, cycled, done: false };
    }

    console.log(
      `[bulkUpdateSnapshotRetention] done cleared=${cleared} stillExpiring=${stillExpiring} skipped=${skipped} cycled=${cycled} cycleIfNeeded=${cycleIfNeeded}`,
    );
    return { cleared, stillExpiring, skipped, cycled, done: true };
  },
});

/**
 * Hard-delete Snapshot.list tombstones (`status: "deleted"`). keep-last with
 * deleteEvicted marks them deleted but they still show an expiresAt clock in
 * the dashboard until hard-purged. Never touches `status: "created"`.
 *
 *   npx convex run sandbox:purgeDeletedSnapshotTombstones --prod
 *   npx convex run sandbox:purgeDeletedSnapshotTombstones --prod '{"repoId":"..."}'
 */
export const purgeDeletedSnapshotTombstones = internalAction({
  args: {
    repoId: v.optional(v.id("githubRepos")),
    repoIndex: v.optional(v.number()),
    deleted: v.optional(v.number()),
    failed: v.optional(v.number()),
    skippedLive: v.optional(v.number()),
    projectsSeen: v.optional(v.array(v.string())),
  },
  returns: v.object({
    deleted: v.number(),
    failed: v.number(),
    skippedLive: v.number(),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    let deleted = args.deleted ?? 0;
    let failed = args.failed ?? 0;
    let skippedLive = args.skippedLive ?? 0;
    const projectsSeen = new Set(args.projectsSeen ?? []);

    const repoIds =
      args.repoId !== undefined
        ? [args.repoId]
        : await ctx.runQuery(internal.sandboxCleanup.listGithubRepoIds, {});
    const repoIndex = args.repoIndex ?? 0;

    if (repoIndex >= repoIds.length) {
      console.log(
        `[purgeDeletedSnapshotTombstones] done deleted=${deleted} failed=${failed} skippedLive=${skippedLive} projects=${projectsSeen.size}`,
      );
      return { deleted, failed, skippedLive, done: true };
    }

    const repoId = repoIds[repoIndex];
    if (repoId === undefined) {
      return { deleted, failed, skippedLive, done: true };
    }

    try {
      const credentials = await resolveSandboxCredentialsOnly(ctx, repoId);
      const projectKey = `${credentials.teamId}:${credentials.projectId}`;
      if (!projectsSeen.has(projectKey)) {
        projectsSeen.add(projectKey);
        const listed = await Snapshot.list({
          token: credentials.token,
          teamId: credentials.teamId,
          projectId: credentials.projectId,
        });
        const tombstones: string[] = [];
        for await (const meta of listed) {
          if (String(meta.status) === "deleted") {
            tombstones.push(meta.id);
          } else {
            skippedLive += 1;
          }
        }
        const results = await Promise.all(
          tombstones.map(async (snapshotId) => {
            try {
              const snap = await Snapshot.get({
                token: credentials.token,
                teamId: credentials.teamId,
                projectId: credentials.projectId,
                snapshotId,
              });
              await snap.delete();
              return "deleted" as const;
            } catch (err) {
              console.warn(
                `[purgeDeletedSnapshotTombstones] failed snapshotId=${snapshotId}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
              return "failed" as const;
            }
          }),
        );
        for (const result of results) {
          if (result === "deleted") deleted += 1;
          else failed += 1;
        }
        console.log(
          `[purgeDeletedSnapshotTombstones] project=${credentials.projectId} tombstones=${tombstones.length} deleted=${deleted} failed=${failed}`,
        );
      }
    } catch (err) {
      console.warn(
        `[purgeDeletedSnapshotTombstones] skip repo=${repoId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const nextIndex = repoIndex + 1;
    if (nextIndex < repoIds.length && args.repoId === undefined) {
      await ctx.scheduler.runAfter(
        0,
        internal.sandbox.purgeDeletedSnapshotTombstones,
        {
          repoIndex: nextIndex,
          deleted,
          failed,
          skippedLive,
          projectsSeen: [...projectsSeen],
        },
      );
      return { deleted, failed, skippedLive, done: false };
    }

    console.log(
      `[purgeDeletedSnapshotTombstones] done deleted=${deleted} failed=${failed} skippedLive=${skippedLive} projects=${projectsSeen.size}`,
    );
    return { deleted, failed, skippedLive, done: true };
  },
});

/**
 * Look up specific snap_* ids across Vercel projects (and optionally delete
 * if status is still `created` and not a live sandbox's currentSnapshotId).
 *
 *   npx convex run sandbox:inspectSnapshotsByIds --prod '{"snapshotIds":["snap_…"],"tryDelete":true}'
 */
export const inspectSnapshotsByIds = internalAction({
  args: {
    snapshotIds: v.array(v.string()),
    tryDelete: v.optional(v.boolean()),
  },
  returns: v.object({
    results: v.array(snapshotLookupRowValidator),
  }),
  handler: async (ctx, args) => {
    const tryDelete = args.tryDelete === true;
    const now = Date.now();
    // Group seeded snapshots (repoGroups.seededSnapshotName) are not any live
    // sandbox's currentSnapshotId, so the `protectedBy` check below would
    // otherwise wave a manual tryDelete straight through one.
    const groupSnapshotIds = new Set(
      await ctx.runQuery(internal.repoGroups.listAllGroupSnapshotNames, {}),
    );
    const uniqueIds = [...new Set(args.snapshotIds.filter((id) => id.length > 0))];
    const remaining = new Set(uniqueIds);
    const byId = new Map<string, SnapshotLookupRow>();
    for (const snapshotId of uniqueIds) {
      byId.set(snapshotId, {
        snapshotId,
        found: false,
        projectId: null,
        status: null,
        sizeBytes: null,
        expiresAt: null,
        daysUntilExpire: null,
        protectedBySandbox: null,
        deleted: false,
        error: null,
      });
    }

    const repoIds = await ctx.runQuery(
      internal.sandboxCleanup.listGithubRepoIds,
      {},
    );
    const projectsSeen = new Set<string>();

    for (const repoId of repoIds) {
      if (remaining.size === 0) break;
      let credentials;
      try {
        credentials = await resolveSandboxCredentialsOnly(ctx, repoId);
      } catch (err) {
        console.warn(
          `[inspectSnapshotsByIds] skip repo=${repoId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        continue;
      }
      const projectKey = `${credentials.teamId}:${credentials.projectId}`;
      if (projectsSeen.has(projectKey)) continue;
      projectsSeen.add(projectKey);

      const protectedBy = new Map<string, string>();
      try {
        const sandboxes = await Sandbox.list({
          token: credentials.token,
          teamId: credentials.teamId,
          projectId: credentials.projectId,
        });
        for await (const sandbox of sandboxes) {
          const currentId = sandbox.currentSnapshotId;
          if (typeof currentId === "string" && currentId.length > 0) {
            protectedBy.set(currentId, sandbox.name);
          }
        }
      } catch (err) {
        console.warn(
          `[inspectSnapshotsByIds] Sandbox.list failed project=${credentials.projectId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      for (const snapshotId of remaining) {
        try {
          const snap = await Snapshot.get({
            token: credentials.token,
            teamId: credentials.teamId,
            projectId: credentials.projectId,
            snapshotId,
          });
          const expiresAt =
            snap.expiresAt === undefined || snap.expiresAt === null
              ? null
              : snap.expiresAt.getTime();
          const protector = protectedBy.get(snapshotId) ?? null;
          const row: SnapshotLookupRow = {
            snapshotId,
            found: true,
            projectId: credentials.projectId,
            status: String(snap.status),
            sizeBytes: snap.sizeBytes,
            expiresAt,
            daysUntilExpire:
              expiresAt === null
                ? null
                : Math.round((expiresAt - now) / (24 * 60 * 60 * 1000)),
            protectedBySandbox: protector,
            deleted: false,
            error: null,
          };
          if (tryDelete && String(snap.status) === "created") {
            if (protector !== null) {
              row.error = `protected by live sandbox ${protector}`;
            } else if (groupSnapshotIds.has(snapshotId)) {
              row.error = "protected: repo group seeded snapshot";
            } else {
              try {
                await snap.delete();
                row.deleted = true;
              } catch (delErr) {
                row.error =
                  delErr instanceof Error ? delErr.message : String(delErr);
              }
            }
          } else if (tryDelete && String(snap.status) !== "created") {
            row.error = `cannot delete status=${snap.status}`;
          }
          byId.set(snapshotId, row);
          remaining.delete(snapshotId);
          console.log(`[inspectSnapshotsByIds] ${JSON.stringify(row)}`);
        } catch {
          // wrong project — keep searching
        }
      }
    }

    for (const snapshotId of remaining) {
      const row = byId.get(snapshotId);
      if (row) {
        row.error = "not found in any project";
        console.log(`[inspectSnapshotsByIds] ${JSON.stringify(row)}`);
      }
    }

    return {
      results: uniqueIds.flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
      }),
    };
  },
});
