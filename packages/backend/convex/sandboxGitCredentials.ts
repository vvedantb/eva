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
import { isReadOnlySandboxOwner } from "./_sessions/owner";

/** Upserts the credential row for a sandbox, replacing any prior secret. */
export const upsertForSandbox = internalMutation({
  args: {
    sandboxId: v.string(),
    installationId: v.number(),
    installationIds: v.optional(v.array(v.number())),
    secret: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sandboxGitCredentials")
      .withIndex("by_sandbox_id", (q) => q.eq("sandboxId", args.sandboxId))
      .unique();
    const merged = Array.from(
      new Set([
        ...(existing?.installationIds ?? []),
        ...(args.installationIds ?? []),
        args.installationId,
      ]),
    );
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

function pinnedHomeRepo(
  row: Doc<"sandboxGitCredentials">,
): { owner: string; name: string } | null {
  if (row.repoOwner === undefined || row.repoName === undefined) return null;
  return { owner: row.repoOwner, name: row.repoName };
}

async function lookupSandboxOwner(
  db: GenericDatabaseReader<DataModel>,
  sandboxId: string,
): Promise<{
  userId: Id<"users">;
  repoId: Id<"githubRepos">;
  sessionId?: Id<"sessions">;
  readOnly: boolean;
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
      readOnly: isReadOnlySandboxOwner(session.owner),
    };
  }

  return null;
}

async function readOnlyCredential(
  db: GenericDatabaseReader<DataModel>,
  entity: { userId: Id<"users">; repoId: Id<"githubRepos"> },
  sandboxId: string,
  requested: { owner: string; name: string } | null,
) {
  const homeRepo = await db.get(entity.repoId);
  if (!homeRepo) {
    return { kind: "denied" as const, reason: "home repository missing" };
  }
  const target =
    requested === null || isSameGitHubRepo(homeRepo, requested)
      ? homeRepo
      : await resolveSiblingReadAccess(
          db,
          entity.userId,
          entity.repoId,
          requested.owner,
          requested.name,
        );
  if (!target) {
    return {
      kind: "denied" as const,
      reason: `no access to ${requested?.owner}/${requested?.name}`,
    };
  }
  return {
    kind: "read_only" as const,
    installationId: target.installationId,
    owner: target.owner,
    name: target.name,
    githubId: target.githubId,
    sandboxId,
  };
}

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
 * A project coordinator's sandbox (a project-owned session) gets a read-only
 * token for whatever it may read, never a push token (`readOnlyCredential`).
 *
 * `path` is the repository git asked about (`owner/repo.git`, sent because the
 * helper sets `credential.useHttpPath`). No path, or the sandbox's own home
 * repository, keeps the historical behaviour: a full installation token. A
 * linked repo of a multi-repo session gets a full token too, for its own
 * installation, which may differ from the primary's — but only from the
 * allow-list recorded on the credential row, so a sandbox can never mint for an
 * installation its session does not use. Any other repository gets a
 * single-repository contents-write token (clone + push, nothing else), and only
 * when the sandbox owner can reach that repository in eva and it has not opted
 * out.
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
    v.object({
      kind: v.literal("read_only"),
      installationId: v.number(),
      owner: v.string(),
      name: v.string(),
      githubId: v.optional(v.number()),
      sandboxId: v.string(),
    }),
    v.object({ kind: v.literal("denied"), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("sandboxGitCredentials")
      .withIndex("by_secret", (q) => q.eq("secret", args.secret))
      .unique();
    if (!row) return { kind: "denied" as const, reason: "unknown secret" };

    const requested =
      args.path === undefined ? null : parseRepoPath(args.path);

    const owner = await lookupSandboxOwner(ctx.db, row.sandboxId);
    if (owner?.readOnly) {
      return await readOnlyCredential(ctx.db, owner, row.sandboxId, requested);
    }

    if (!requested) {
      return { kind: "home" as const, installationId: row.installationId };
    }

    const pinned = pinnedHomeRepo(row);
    if (pinned && isSameGitHubRepo(pinned, requested)) {
      return { kind: "home" as const, installationId: row.installationId };
    }

    const entity = owner;
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
