import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import { internalMutation, internalQuery } from "./_generated/server";
import type { DataModel, Id } from "./_generated/dataModel";
import {
  isSameGitHubRepo,
  resolveSiblingReadAccess,
} from "./_githubRepos/sandboxRead";

/** Upserts the credential row for a sandbox, replacing any prior secret. */
export const upsertForSandbox = internalMutation({
  args: {
    sandboxId: v.string(),
    installationId: v.number(),
    secret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sandboxGitCredentials")
      .withIndex("by_sandbox_id", (q) => q.eq("sandboxId", args.sandboxId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        installationId: args.installationId,
        secret: args.secret,
        createdAt: Date.now(),
      });
      return null;
    }
    await ctx.db.insert("sandboxGitCredentials", {
      sandboxId: args.sandboxId,
      installationId: args.installationId,
      secret: args.secret,
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * Parses git's `path=` credential field into owner/name.
 * Returns null when absent or not a two-segment GitHub repository path.
 */
function parseRepoPath(
  path: string | undefined,
): { owner: string; name: string } | null {
  if (path === undefined) return null;
  let trimmed = path.trim();
  if (trimmed.startsWith("/")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith(".git")) trimmed = trimmed.slice(0, -".git".length);
  const segments = trimmed.split("/").filter((part) => part.length > 0);
  if (segments.length !== 2) return null;
  const [owner, name] = segments;
  if (owner === undefined || name === undefined) return null;
  return { owner, name };
}

/** The eva entity a sandbox belongs to: who owns it and which repo is its home. */
async function lookupSandboxOwner(
  db: GenericDatabaseReader<DataModel>,
  sandboxId: string,
): Promise<{ userId: Id<"users">; repoId: Id<"githubRepos"> } | null> {
  const session = await db
    .query("sessions")
    .withIndex("by_sandbox", (q) => q.eq("sandboxId", sandboxId))
    .first();
  if (session) return { userId: session.userId, repoId: session.repoId };

  const project = await db
    .query("projects")
    .withIndex("by_sandbox", (q) => q.eq("sandboxId", sandboxId))
    .first();
  if (project) return { userId: project.userId, repoId: project.repoId };

  const task = await db
    .query("agentTasks")
    .withIndex("by_sandbox", (q) => q.eq("sandboxId", sandboxId))
    .first();
  if (!task) return null;
  if (task.repoId) return { userId: task.createdBy, repoId: task.repoId };
  if (task.projectId) {
    const taskProject = await db.get(task.projectId);
    if (taskProject) {
      return { userId: task.createdBy, repoId: taskProject.repoId };
    }
  }
  return null;
}

/**
 * Decides what token a sandbox credential request may have.
 *
 * `path` is the repository git asked about (`owner/repo.git`, sent because the
 * helper sets `credential.useHttpPath`). No path, or the sandbox's own home
 * repository, keeps the historical behaviour: a full installation token. A
 * different repository gets a read-only, single-repository token, but only when
 * the sandbox owner can reach that repository in eva and it has not opted out.
 */
export const resolveCredentialRequest = internalQuery({
  args: { secret: v.string(), path: v.optional(v.string()) },
  returns: v.union(
    v.object({ kind: v.literal("home"), installationId: v.number() }),
    v.object({
      kind: v.literal("sibling"),
      installationId: v.number(),
      owner: v.string(),
      name: v.string(),
      githubId: v.optional(v.number()),
      sandboxId: v.string(),
      userId: v.id("users"),
    }),
    v.object({ kind: v.literal("denied"), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("sandboxGitCredentials")
      .withIndex("by_secret", (q) => q.eq("secret", args.secret))
      .unique();
    if (!row) return { kind: "denied" as const, reason: "unknown secret" };

    const requested = parseRepoPath(args.path);
    if (!requested) {
      return { kind: "home" as const, installationId: row.installationId };
    }

    const entity = await lookupSandboxOwner(ctx.db, row.sandboxId);
    if (!entity) {
      return {
        kind: "denied" as const,
        reason: "sandbox not bound to an entity",
      };
    }

    const homeRepo = await ctx.db.get(entity.repoId);
    if (!homeRepo) {
      return { kind: "denied" as const, reason: "home repository missing" };
    }
    if (isSameGitHubRepo(homeRepo, requested)) {
      return { kind: "home" as const, installationId: row.installationId };
    }

    const sibling = await resolveSiblingReadAccess(
      ctx.db,
      entity.userId,
      entity.repoId,
      requested.owner,
      requested.name,
    );
    if (!sibling) {
      return {
        kind: "denied" as const,
        reason: `no access to ${requested.owner}/${requested.name}`,
      };
    }

    return {
      kind: "sibling" as const,
      installationId: sibling.installationId,
      owner: sibling.owner,
      name: sibling.name,
      githubId: sibling.githubId,
      sandboxId: row.sandboxId,
      userId: entity.userId,
    };
  },
});

/** Removes the credential row for a sandbox (best-effort cleanup on delete). */
export const deleteBySandboxId = internalMutation({
  args: { sandboxId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sandboxGitCredentials")
      .withIndex("by_sandbox_id", (q) => q.eq("sandboxId", args.sandboxId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});
