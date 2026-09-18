import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import { internalMutation, internalQuery } from "./_generated/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import {
  isSameGitHubRepo,
  resolveSiblingReadAccess,
} from "./_githubRepos/sandboxRead";
import {
  isInstallationAllowed,
  parseRepoPath,
} from "./_sandbox_runtime/gitCredentialsPath";

/** Upserts the credential row for a sandbox, replacing any prior secret. */
export const upsertForSandbox = internalMutation({
  args: {
    sandboxId: v.string(),
    installationId: v.number(),
    // Every installation the sandbox may mint a token for, primary included.
    // Absent (or primary-only) for an ordinary single-repo session.
    installationIds: v.optional(v.array(v.number())),
    secret: v.string(),
    // The sandbox's own repository; see resolveCredentialRequest.
    repoOwner: v.string(),
    repoName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sandboxGitCredentials")
      .withIndex("by_sandbox_id", (q) => q.eq("sandboxId", args.sandboxId))
      .unique();
    // Union, never replace. `ensureGitCredentialHelper` re-runs on every
    // resume knowing only the primary installation, and once per linked repo
    // knowing only that one — replacing here dropped a multi-repo session's
    // other installations and `/api/git-credentials` then 403'd their pushes.
    // A sandbox only ever serves one session, so the union can only ever hold
    // that session's own repos.
    const merged = Array.from(
      new Set([
        ...(existing?.installationIds ?? []),
        ...(args.installationIds ?? []),
        args.installationId,
      ]),
    );
    // Single-repo sessions keep the field absent, as before multi-repo:
    // `allowedInstallationIds` falls back to the scalar `installationId`.
    const installationIds = merged.length > 1 ? merged : undefined;
    if (existing) {
      await ctx.db.patch(existing._id, {
        installationId: args.installationId,
        installationIds,
        secret: args.secret,
        repoOwner: args.repoOwner,
        repoName: args.repoName,
        createdAt: Date.now(),
      });
      return null;
    }
    await ctx.db.insert("sandboxGitCredentials", {
      sandboxId: args.sandboxId,
      installationId: args.installationId,
      installationIds,
      secret: args.secret,
      repoOwner: args.repoOwner,
      repoName: args.repoName,
      createdAt: Date.now(),
    });
    return null;
  },
});

/** The repository a credential row was installed for, when the row pins one. */
function pinnedHomeRepo(
  row: Doc<"sandboxGitCredentials">,
): { owner: string; name: string } | null {
  if (row.repoOwner === undefined || row.repoName === undefined) return null;
  return { owner: row.repoOwner, name: row.repoName };
}

/** The eva entity a sandbox belongs to: who owns it and which repo is its home. */
async function lookupSandboxOwner(
  db: GenericDatabaseReader<DataModel>,
  sandboxId: string,
): Promise<{
  userId: Id<"users">;
  repoId: Id<"githubRepos">;
  /** Only sessions can carry linked repos (multi-repo sessions). */
  sessionId?: Id<"sessions">;
} | null> {
  const session = await db
    .query("sessions")
    .withIndex("by_sandbox", (q) => q.eq("sandboxId", sandboxId))
    .first();
  if (session) {
    return {
      userId: session.userId,
      repoId: session.repoId,
      sessionId: session._id,
    };
  }

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
 * The `sessionRepos` row for a repository a multi-repo session cloned beside
 * its primary, or null when the session did not link that repository.
 */
async function linkedSessionRepo(
  db: GenericDatabaseReader<DataModel>,
  sessionId: Id<"sessions">,
  repo: { owner: string; name: string },
): Promise<Doc<"sessionRepos"> | null> {
  const rows = await db
    .query("sessionRepos")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
  return rows.find((row) => isSameGitHubRepo(row, repo)) ?? null;
}

/**
 * Decides what token a sandbox credential request may have.
 *
 * `path` is the repository git asked about (`owner/repo.git`, sent because the
 * helper sets `credential.useHttpPath`). No path, or the sandbox's own home
 * repository, keeps the historical behaviour: a full installation token. A
 * linked repo of a multi-repo session gets a full token too, for its own
 * installation, which may differ from the primary's — but only from the
 * allow-list recorded on the credential row, so a sandbox can never mint for an
 * installation its session does not use. Any other repository gets a read-only,
 * single-repository token, and only when the sandbox owner can reach that
 * repository in eva and it has not opted out.
 *
 * The home repository is read from the credential row first (pinned when the
 * helper is installed), so sandboxes bound to no eva entity — snapshot
 * seed-prep, ephemeral automation / test-gen / evaluation runs — can fetch and
 * push their own repository. Only sibling reads need the entity's owner.
 */
export const resolveCredentialRequest = internalQuery({
  args: { secret: v.string(), path: v.optional(v.string()) },
  returns: v.union(
    v.object({ kind: v.literal("home"), installationId: v.number() }),
    v.object({
      kind: v.literal("linked"),
      installationId: v.number(),
      owner: v.string(),
      name: v.string(),
      sandboxId: v.string(),
    }),
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

    // No path: an old baked helper script, or a fetch from before
    // `useHttpPath` rolled out. Mint for the sandbox's primary installation.
    const requested =
      args.path === undefined ? null : parseRepoPath(args.path);
    if (!requested) {
      return { kind: "home" as const, installationId: row.installationId };
    }

    // Rows written before the pin fall through to the entity's repository.
    const pinned = pinnedHomeRepo(row);
    if (pinned && isSameGitHubRepo(pinned, requested)) {
      return { kind: "home" as const, installationId: row.installationId };
    }

    const entity = await lookupSandboxOwner(ctx.db, row.sandboxId);
    if (!entity) {
      return {
        kind: "denied" as const,
        reason: `sandbox ${row.sandboxId} not bound to an entity (asked for ${requested.owner}/${requested.name})`,
      };
    }

    const homeRepo = await ctx.db.get(entity.repoId);
    if (!homeRepo) {
      return { kind: "denied" as const, reason: "home repository missing" };
    }
    if (isSameGitHubRepo(homeRepo, requested)) {
      return { kind: "home" as const, installationId: row.installationId };
    }

    // A multi-repo session's linked repo needs a full token to push, and it may
    // live under another GitHub App installation than the primary. Two guards:
    // the session must actually have linked that repository, and the
    // installation must be on the allow-list the helper install recorded — so a
    // sandbox can never mint for an installation its own session does not use.
    // Checked after the home repository (which keeps the primary installation)
    // and before the sibling read (which is read-only).
    const linked = entity.sessionId
      ? await linkedSessionRepo(ctx.db, entity.sessionId, requested)
      : null;
    if (linked && isInstallationAllowed(linked.installationId, row)) {
      return {
        kind: "linked" as const,
        installationId: linked.installationId,
        owner: linked.owner,
        name: linked.name,
        sandboxId: row.sandboxId,
      };
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
