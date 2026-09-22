/**
 * Group seeded snapshots: fingerprinting + the isolate queries/mutations the
 * build action and sandbox-boot path share. Pure/isolate only — the actual
 * sandbox build runs in the "use node" action in `snapshotBuild.ts`.
 *
 * Kept in an underscore-prefixed folder (excluded from Convex's function
 * discovery) and re-exported through the top-level `repoGroups.ts`, mirroring
 * `_repoSnapshots/config.ts` → `repoSnapshots.ts`.
 */
import { v, type Infer } from "convex/values";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

/** True when `value` is not null — usable as an Array.filter type predicate. */
function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

/** The branch a linked repo's clone checks out, falling back like sessions do. */
function memberBaseBranch(defaultBaseBranch: string | undefined): string {
  return defaultBaseBranch?.trim() || FALLBACK_GIT_BASE_BRANCH;
}

export type RepoGroupFingerprintMember = {
  repoId: string;
  defaultBaseBranch: string;
};

export type RepoGroupFingerprintInput = {
  /** The primary repo's own seeded snapshot the group boots the builder from. */
  primarySeededSnapshotName: string | null;
  /** Linked repos only — sorted internally so member order never matters. */
  members: ReadonlyArray<RepoGroupFingerprintMember>;
  installDependencies: boolean;
};

/**
 * Stable fingerprint of the inputs a group's seeded snapshot was built from:
 * the primary's own seeded snapshot, every linked repo + the branch it clones,
 * and whether dependencies are installed. When this matches the fingerprint
 * stored alongside `seededSnapshotName`, the existing snapshot is still valid
 * and a rebuild is skipped.
 *
 * djb2 — cheap, deterministic, dependency-free (isolate functions cannot reach
 * `node:crypto`); mirrors `getSeedFingerprint` in `_repoSnapshots/config.ts`.
 */
export function computeRepoGroupFingerprint(
  input: RepoGroupFingerprintInput,
): string {
  const sortedMembers = [...input.members]
    .map((member) => ({
      repoId: member.repoId,
      defaultBaseBranch: member.defaultBaseBranch,
    }))
    .sort((a, b) => (a.repoId < b.repoId ? -1 : a.repoId > b.repoId ? 1 : 0));
  const payload = JSON.stringify({
    primarySeededSnapshotName: input.primarySeededSnapshotName,
    members: sortedMembers,
    installDependencies: input.installDependencies,
  });
  let hash = 5381;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 33) ^ payload.charCodeAt(i);
  }
  const hashHex = (hash >>> 0).toString(16).padStart(8, "0");
  const lengthHex = payload.length.toString(16).padStart(4, "0");
  return `${hashHex}${lengthHex}`;
}

const groupBuildMemberValidator = v.object({
  repoId: v.id("githubRepos"),
  owner: v.string(),
  name: v.string(),
  installationId: v.number(),
  defaultBaseBranch: v.string(),
});

const groupBuildPrimaryValidator = v.object({
  repoId: v.id("githubRepos"),
  owner: v.string(),
  name: v.string(),
  installationId: v.number(),
  /** Null when the primary itself has no seeded snapshot yet — build must wait. */
  seededSnapshotName: v.union(v.string(), v.null()),
});

const groupForBuildReturnValidator = v.union(
  v.object({
    group: v.object({
      primaryRepoId: v.id("githubRepos"),
      installDependencies: v.optional(v.boolean()),
      seededSnapshotName: v.optional(v.string()),
      seededFingerprint: v.optional(v.string()),
    }),
    primary: groupBuildPrimaryValidator,
    linked: v.array(groupBuildMemberValidator),
  }),
  v.null(),
);

/**
 * Return shape of `getGroupForBuild`, exported so `snapshotBuild.ts` can
 * annotate the `ctx.runQuery` result explicitly instead of relying on
 * `_generated/api.d.ts` being freshly regenerated.
 */
export type GroupForBuildResult = Infer<typeof groupForBuildReturnValidator>;

/**
 * Everything `buildGroupSnapshot` needs: the group's install flag + current
 * snapshot/fingerprint, the primary repo (for its seeded snapshot + git
 * identity), and every linked repo resolved to a clone target + branch. Null
 * when the group or its primary repo no longer exists.
 */
export const getGroupForBuild = internalQuery({
  args: { groupId: v.id("repoGroups") },
  returns: groupForBuildReturnValidator,
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId);
    if (!group) return null;
    const primaryDoc = await ctx.db.get(group.primaryRepoId);
    if (!primaryDoc) return null;
    const linkedDocs = await Promise.all(
      group.linkedRepoIds.map((repoId) => ctx.db.get(repoId)),
    );
    const linked = linkedDocs.filter(isPresent).map((doc) => ({
      repoId: doc._id,
      owner: doc.owner,
      name: doc.name,
      installationId: doc.installationId,
      defaultBaseBranch: memberBaseBranch(doc.defaultBaseBranch),
    }));
    return {
      group: {
        primaryRepoId: group.primaryRepoId,
        installDependencies: group.installDependencies,
        seededSnapshotName: group.seededSnapshotName,
        seededFingerprint: group.seededFingerprint,
      },
      primary: {
        repoId: primaryDoc._id,
        owner: primaryDoc.owner,
        name: primaryDoc.name,
        installationId: primaryDoc.installationId,
        seededSnapshotName: primaryDoc.seededSnapshotName ?? null,
      },
      linked,
    };
  },
});

/** Patches a group with a newly-built snapshot. No-ops if the group was deleted mid-build. */
export const setGroupSeededSnapshot = internalMutation({
  args: {
    groupId: v.id("repoGroups"),
    seededSnapshotName: v.string(),
    seededFingerprint: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId);
    if (!group) return null;
    await ctx.db.patch(args.groupId, {
      seededSnapshotName: args.seededSnapshotName,
      seededFingerprint: args.seededFingerprint,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * The group's seeded snapshot name, but only when it is still current — the
 * primary's own seeded snapshot and every linked repo's branch are re-hashed
 * and compared against the fingerprint stored at build time. Returns null
 * (fall back to the plain per-repo snapshot) when the group has no snapshot
 * yet, a member repo was deleted, or the stored fingerprint is stale.
 */
export const getGroupSnapshotForBoot = internalQuery({
  args: { groupId: v.id("repoGroups") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId);
    if (!group || !group.seededSnapshotName || !group.seededFingerprint) {
      return null;
    }
    const primaryDoc = await ctx.db.get(group.primaryRepoId);
    if (!primaryDoc || !primaryDoc.seededSnapshotName) return null;
    const linkedDocs = await Promise.all(
      group.linkedRepoIds.map((repoId) => ctx.db.get(repoId)),
    );
    const linked = linkedDocs.filter(isPresent);
    // A member repo row was deleted — the recorded membership can no longer
    // be reproduced, so the snapshot cannot be trusted as current.
    if (linked.length !== group.linkedRepoIds.length) return null;
    const fingerprint = computeRepoGroupFingerprint({
      primarySeededSnapshotName: primaryDoc.seededSnapshotName,
      members: linked.map((doc) => ({
        repoId: String(doc._id),
        defaultBaseBranch: memberBaseBranch(doc.defaultBaseBranch),
      })),
      installDependencies: group.installDependencies !== false,
    });
    return fingerprint === group.seededFingerprint
      ? group.seededSnapshotName
      : null;
  },
});

/** Every group whose primary repo is `primaryRepoId`. The table is small; scan + filter. */
export const listGroupsByPrimaryRepo = internalQuery({
  args: { primaryRepoId: v.id("githubRepos") },
  returns: v.array(v.id("repoGroups")),
  handler: async (ctx, args) => {
    const groups = await ctx.db.query("repoGroups").collect();
    return groups
      .filter((group) => group.primaryRepoId === args.primaryRepoId)
      .map((group) => group._id);
  },
});

/** Every group's `seededSnapshotName`, for the orphan-snapshot purge protection lists. */
export const listAllGroupSnapshotNames = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const groups = await ctx.db.query("repoGroups").collect();
    return groups
      .map((group) => group.seededSnapshotName)
      .filter((name): name is string => name !== undefined);
  },
});

/**
 * Schedules a rebuild for one group. A thin mutation wrapper around the
 * scheduler call so callers that only have a query context (e.g. a workflow
 * step that just ran `listGroupsByPrimaryRepo`) can still trigger it.
 */
export const scheduleGroupRebuild = internalMutation({
  args: { groupId: v.id("repoGroups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(
      0,
      internal.repoGroupsActions.buildGroupSnapshot,
      { groupId: args.groupId },
    );
    return null;
  },
});
