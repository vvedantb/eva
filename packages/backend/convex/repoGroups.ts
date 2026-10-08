import { v } from "convex/values";
import type { GenericDatabaseReader, StorageReader } from "convex/server";
import { internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import { userCanAccessRepo } from "./_githubRepos/helpers";
import { repoGroupFields } from "./validators";
import {
  validateRepoGroupMembers,
  type RepoGroupMember,
} from "./_repoGroups/validate";

// Group seeded snapshots: fingerprint + isolate queries/mutations live in
// `_repoGroups/snapshot.ts` (underscore-prefixed, excluded from Convex's
// function discovery) and are re-exported here so they register under
// `internal.repoGroups.*`, mirroring `_repoSnapshots/config.ts` → `repoSnapshots.ts`.
export {
  getGroupForBuild,
  setGroupSeededSnapshot,
  getGroupSnapshotForBoot,
  listGroupsByPrimaryRepo,
  listAllGroupSnapshotNames,
  scheduleGroupRebuild,
} from "./_repoGroups/snapshot";

/**
 * Saved codebase groups: one primary repo plus the linked repos that should be
 * cloned into the same session sandbox. A group only prefills the new-session
 * picker — a session copies the membership into `sessionRepos` rows at
 * creation, so editing a group never rewrites sessions already running.
 */

/** Just enough of a member repo for the picker to render it. */
const repoGroupMemberValidator = v.object({
  _id: v.id("githubRepos"),
  owner: v.string(),
  name: v.string(),
  rootDirectory: v.optional(v.string()),
  label: v.optional(v.string()),
  logoUrl: v.optional(v.union(v.string(), v.null())),
});

const repoGroupWithMembersValidator = v.object({
  _id: v.id("repoGroups"),
  _creationTime: v.number(),
  ...repoGroupFields,
  /** Null when the primary repo row has been deleted under the group. */
  primaryRepo: v.union(repoGroupMemberValidator, v.null()),
  /** Resolved members, in `linkedRepoIds` order; deleted rows are dropped. */
  linkedRepos: v.array(repoGroupMemberValidator),
});

/** True when the caller created the group or shares the team it belongs to. */
export async function canAccessRepoGroup(
  db: GenericDatabaseReader<DataModel>,
  group: Doc<"repoGroups">,
  userId: Id<"users">,
): Promise<boolean> {
  if (group.createdBy === userId) return true;
  const teamId = group.teamId;
  if (!teamId) return false;
  const membership = await db
    .query("teamMembers")
    .withIndex("by_team_and_user", (q) =>
      q.eq("teamId", teamId).eq("userId", userId),
    )
    .first();
  return membership !== null;
}

/** Loads a group and throws unless the caller may see it. */
async function getGroupWithAccess(
  db: GenericDatabaseReader<DataModel>,
  id: Id<"repoGroups">,
  userId: Id<"users">,
): Promise<Doc<"repoGroups">> {
  const group = await db.get(id);
  if (!group) throw new Error("Codebase group not found");
  if (!(await canAccessRepoGroup(db, group, userId))) {
    throw new Error("Not authorized");
  }
  return group;
}

/** Loads one repo, throwing unless it exists and the caller may use it. */
async function loadAccessibleRepo(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
  userId: Id<"users">,
): Promise<Doc<"githubRepos">> {
  const repo = await db.get(repoId);
  if (!repo) throw new Error("Repository not found");
  if (!(await userCanAccessRepo(db, userId, repo))) {
    throw new Error("Not authorized");
  }
  return repo;
}

/** Loads every linked repo the caller may use, in the given order. */
async function loadAccessibleRepos(
  db: GenericDatabaseReader<DataModel>,
  repoIds: ReadonlyArray<Id<"githubRepos">>,
  userId: Id<"users">,
): Promise<Array<Doc<"githubRepos">>> {
  const repos: Array<Doc<"githubRepos">> = [];
  for (const repoId of repoIds) {
    repos.push(await loadAccessibleRepo(db, repoId, userId));
  }
  return repos;
}

/** The identity shape the membership rules work on. */
function toMember(repo: Doc<"githubRepos">): RepoGroupMember {
  return { id: String(repo._id), owner: repo.owner, name: repo.name };
}

/** Validates a primary + linked selection, throwing the rule that failed. */
export function assertValidRepoGroupMembers(
  primary: Doc<"githubRepos">,
  linked: Array<Doc<"githubRepos">>,
): void {
  const error = validateRepoGroupMembers(
    toMember(primary),
    linked.map(toMember),
  );
  if (error !== null) throw new Error(error);
}

/** Picker summary for one member repo, with its logo resolved. */
async function toRepoSummary(storage: StorageReader, repo: Doc<"githubRepos">) {
  return {
    _id: repo._id,
    owner: repo.owner,
    name: repo.name,
    rootDirectory: repo.rootDirectory,
    label: repo.label,
    logoUrl: repo.logoStorageId
      ? await storage.getUrl(repo.logoStorageId)
      : undefined,
  };
}

/** True when two membership lists hold the same repos, whatever the order. */
function sameMembership(
  a: ReadonlyArray<Id<"githubRepos">>,
  b: ReadonlyArray<Id<"githubRepos">>,
): boolean {
  if (a.length !== b.length) return false;
  const left = a.map(String).sort();
  const right = b.map(String).sort();
  return left.every((id, index) => id === right[index]);
}

/** Creates a codebase group from a primary repo and its linked repos. */
export const create = authMutation({
  args: {
    name: v.string(),
    primaryRepoId: v.id("githubRepos"),
    linkedRepoIds: v.array(v.id("githubRepos")),
    installDependencies: v.optional(v.boolean()),
  },
  returns: v.id("repoGroups"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Name is required");
    const primary = await loadAccessibleRepo(
      ctx.db,
      args.primaryRepoId,
      ctx.userId,
    );
    const linked = await loadAccessibleRepos(
      ctx.db,
      args.linkedRepoIds,
      ctx.userId,
    );
    assertValidRepoGroupMembers(primary, linked);

    const groupId = await ctx.db.insert("repoGroups", {
      name,
      createdBy: ctx.userId,
      // Teammates of the primary repo's team see (and may use) the group.
      ...(primary.teamId !== undefined ? { teamId: primary.teamId } : {}),
      primaryRepoId: args.primaryRepoId,
      linkedRepoIds: args.linkedRepoIds,
      ...(args.installDependencies !== undefined
        ? { installDependencies: args.installDependencies }
        : {}),
      createdAt: Date.now(),
    });
    // Best-effort background build — a no-op until the primary has its own
    // seeded snapshot to boot from (buildGroupSnapshot checks and skips).
    await ctx.scheduler.runAfter(
      0,
      internal.repoGroupsActions.buildGroupSnapshot,
      { groupId },
    );
    return groupId;
  },
});

/** Renames a group, replaces its linked repos, or changes its install flag. */
export const update = authMutation({
  args: {
    id: v.id("repoGroups"),
    name: v.optional(v.string()),
    linkedRepoIds: v.optional(v.array(v.id("githubRepos"))),
    installDependencies: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const group = await getGroupWithAccess(ctx.db, args.id, ctx.userId);
    const patch: {
      name?: string;
      linkedRepoIds?: Array<Id<"githubRepos">>;
      installDependencies?: boolean;
      seededSnapshotName?: undefined;
      seededFingerprint?: undefined;
      updatedAt: number;
    } = { updatedAt: Date.now() };
    // A seeded snapshot is only valid for the exact inputs it was built from —
    // track whether anything the fingerprint covers actually changed so a
    // rebuild is scheduled only when needed, not on every rename.
    let inputsChanged = false;

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Name is required");
      patch.name = name;
    }

    if (args.linkedRepoIds !== undefined) {
      const primary = await loadAccessibleRepo(
        ctx.db,
        group.primaryRepoId,
        ctx.userId,
      );
      const linked = await loadAccessibleRepos(
        ctx.db,
        args.linkedRepoIds,
        ctx.userId,
      );
      assertValidRepoGroupMembers(primary, linked);
      patch.linkedRepoIds = args.linkedRepoIds;
      if (!sameMembership(group.linkedRepoIds, args.linkedRepoIds)) {
        patch.seededSnapshotName = undefined;
        patch.seededFingerprint = undefined;
        inputsChanged = true;
      }
    }

    if (args.installDependencies !== undefined) {
      patch.installDependencies = args.installDependencies;
      if ((group.installDependencies !== false) !== (args.installDependencies !== false)) {
        inputsChanged = true;
      }
    }

    await ctx.db.patch(args.id, patch);
    if (inputsChanged) {
      await ctx.scheduler.runAfter(
        0,
        internal.repoGroupsActions.buildGroupSnapshot,
        { groupId: args.id },
      );
    }
    return null;
  },
});

/** Deletes a codebase group. Sessions created from it are untouched. */
export const remove = authMutation({
  args: { id: v.id("repoGroups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const group = await getGroupWithAccess(ctx.db, args.id, ctx.userId);
    if (group.seededSnapshotName) {
      // Best-effort: `deleteSeededSnapshot` never throws on its own failures.
      await ctx.scheduler.runAfter(
        0,
        internal.snapshotActions.deleteSeededSnapshot,
        {
          snapshotName: group.seededSnapshotName,
          repoId: group.primaryRepoId,
        },
      );
    }
    await ctx.db.delete(args.id);
    return null;
  },
});

/** Rebuilds a group's seeded snapshot on demand (e.g. after a manual retry). */
export const rebuildSnapshot = authMutation({
  args: { id: v.id("repoGroups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getGroupWithAccess(ctx.db, args.id, ctx.userId);
    await ctx.scheduler.runAfter(
      0,
      internal.repoGroupsActions.buildGroupSnapshot,
      { groupId: args.id },
    );
    return null;
  },
});

/**
 * Groups the caller created plus those belonging to their teams, each with its
 * member repos resolved so the picker needs no second query. Shared by the
 * app's `listMine` and MCP's `listForUserInternal` so the access rule and the
 * resolved shape have one home.
 */
async function loadGroupsForUser(
  db: GenericDatabaseReader<DataModel>,
  storage: StorageReader,
  userId: Id<"users">,
) {
  const memberships = await db
    .query("teamMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const groupLists = await Promise.all([
    db
      .query("repoGroups")
      .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
      .collect(),
    ...memberships.map((membership) =>
      db
        .query("repoGroups")
        .withIndex("by_team", (q) => q.eq("teamId", membership.teamId))
        .collect(),
    ),
  ]);

  const seen = new Set<string>();
  const groups: Array<Doc<"repoGroups">> = [];
  for (const group of groupLists.flat()) {
    if (seen.has(String(group._id))) continue;
    seen.add(String(group._id));
    groups.push(group);
  }

  return await Promise.all(
    groups.map(async (group) => {
      const primaryDoc = await db.get(group.primaryRepoId);
      const linkedDocs = await Promise.all(
        group.linkedRepoIds.map((repoId) => db.get(repoId)),
      );
      return {
        ...group,
        primaryRepo: primaryDoc ? await toRepoSummary(storage, primaryDoc) : null,
        linkedRepos: await Promise.all(
          linkedDocs
            .filter((repo): repo is Doc<"githubRepos"> => repo !== null)
            .map((repo) => toRepoSummary(storage, repo)),
        ),
      };
    }),
  );
}

export const listMine = authQuery({
  args: {},
  returns: v.array(repoGroupWithMembersValidator),
  handler: async (ctx) => await loadGroupsForUser(ctx.db, ctx.storage, ctx.userId),
});

/**
 * Same groups as `listMine`, for the `list_repos` MCP tool. Takes a plain
 * string since the MCP action layer only ever holds an untyped user id parsed
 * off a JSON response.
 */
export const listForUserInternal = internalQuery({
  args: { userId: v.string() },
  returns: v.array(repoGroupWithMembersValidator),
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!userId) return [];
    return await loadGroupsForUser(ctx.db, ctx.storage, userId);
  },
});

/**
 * Loads a group for `sessions.create`, throwing unless the caller may use it
 * with this primary repo. Kept here so the access rule has one home.
 */
export async function getRepoGroupForSession(
  db: GenericDatabaseReader<DataModel>,
  id: Id<"repoGroups">,
  primaryRepoId: Id<"githubRepos">,
  userId: Id<"users">,
): Promise<Doc<"repoGroups">> {
  const group = await db.get(id);
  if (!group) throw new Error("Codebase group not found");
  if (!(await canAccessRepoGroup(db, group, userId))) {
    throw new Error("Not authorized");
  }
  if (group.primaryRepoId !== primaryRepoId) {
    throw new Error(
      "This codebase group is saved for a different primary repository",
    );
  }
  if (!(await hasRepoAccess(db, group.primaryRepoId, userId))) {
    throw new Error("Not authorized");
  }
  return group;
}
