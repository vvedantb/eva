import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { repoBasePath } from "../_githubRepos/helpers";
import { canonicalPrUrl } from "./sessionRef";
import {
  errorResult,
  matchRepoByName,
  mcpListUserRepos,
  type McpCredentials,
} from "./toolShared";

// Leaf module shared by tools.ts and entityTools.ts. Holds the one definition
// of "which session, quick task or project did the caller mean", so every tool
// that acts on an existing chat resolves it — and checks access — identically.

/** The three chat surfaces an MCP caller can name. */
export const ENTITY_KINDS = ["session", "task", "project"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** Eva url segment for each surface, for the path echoed back to the caller. */
export const ENTITY_PATH_SEGMENT: Record<EntityKind, string> = {
  session: "sessions",
  task: "quick-tasks",
  project: "projects",
};

/**
 * Repo selector shared by the repo-scoped tools. `repoId` is the normal path;
 * `repoName` exists so a caller can name any connected repo without a
 * list_repos round trip first.
 */
export const repoRefArgs = {
  repoId: z
    .string()
    .optional()
    .describe(
      "Repo ID from list_repos, specifying which repo's database to query. Provide this or repoName.",
    ),
  repoName: z
    .string()
    .optional()
    .describe(
      'Repo name (e.g. "eva" or "vvedantb/eva"), as an alternative to repoId. Resolved against your connected repos.',
    ),
  app: z
    .string()
    .optional()
    .describe(
      'App name within a monorepo (e.g. "web"). Used with repoName when a repo has multiple apps.',
    ),
};

/** Naming one existing chat: Convex id, PR link, or numId plus kind and repo. */
export const entityRefArgs = {
  id: z
    .string()
    .optional()
    .describe(
      "The Convex id of the session, quick task or project, if you already have it.",
    ),
  prUrl: z
    .string()
    .optional()
    .describe(
      'The pull request the session, task or project opened, e.g. "https://github.com/vvedantb/eva/pull/664".',
    ),
  numId: z
    .number()
    .optional()
    .describe(
      'The number in the Eva url (42 in ".../sessions/42"). Needs "kind" and repoName or repoId as well.',
    ),
  kind: z
    .enum(ENTITY_KINDS)
    .optional()
    .describe(
      'Which surface: "session", "task" (a quick task\'s sandbox chat) or "project" (a project\'s sandbox chat). Required with numId, since each numbers its own rows; otherwise it just narrows the search.',
    ),
  ...repoRefArgs,
};

export interface RepoRef {
  repoId?: string;
  repoName?: string;
  app?: string;
}

export interface EntityRef extends RepoRef {
  id?: string;
  prUrl?: string;
  numId?: number;
  kind?: EntityKind;
}

/** One resolved chat the caller may act on, with its repo already checked. */
export interface EntityTarget {
  kind: EntityKind;
  targetId: string;
  numId?: number;
  title: string;
  status: string;
  prUrl?: string;
  branchName?: string;
  repoId: string;
  repoOwner: string;
  repoName: string;
  repoRootDirectory?: string;
}

/** Everything needed to name one entity's place in Eva's url structure. */
export interface EntityLocation {
  kind: EntityKind;
  numId?: number;
  repoOwner: string;
  repoName: string;
  repoRootDirectory?: string;
}

/** The `owner/name/sessions/42` path a caller can open in Eva, when numbered. */
export function entityPath(location: EntityLocation): string | undefined {
  if (location.numId === undefined) return undefined;
  const basePath = repoBasePath({
    owner: location.repoOwner,
    name: location.repoName,
    rootDirectory: location.repoRootDirectory,
  });
  return `${basePath}/${ENTITY_PATH_SEGMENT[location.kind]}/${location.numId}`;
}

/** The identity every entity tool echoes back, so replies are comparable. */
export interface EntitySummary {
  kind: EntityKind;
  id: string;
  numId?: number;
  title: string;
  repo: string;
  path?: string;
  prUrl?: string;
  branch?: string;
}

export function entitySummary(target: EntityTarget): EntitySummary {
  return {
    kind: target.kind,
    id: target.targetId,
    numId: target.numId,
    title: target.title,
    repo: `${target.repoOwner}/${target.repoName}`,
    path: entityPath(target),
    prUrl: target.prUrl,
    branch: target.branchName,
  };
}

/**
 * Repo and entity resolution bound to one MCP caller's credentials.
 *
 * Two access levels, on purpose:
 * - Chats (sessions, quick tasks, projects) are reachable across every repo
 *   the user can reach in Eva — a sandbox token acts as its user, the same way
 *   `create_and_run_task` already lets one repo's sandbox open work in another.
 *   A session on eva can therefore continue the carepulse PR it diagnosed
 *   instead of having to open a second task.
 * - Repo credentials (Convex deploy keys, Postgres, system skills) keep the
 *   sandbox token's single-repo pin: code running in one repo's sandbox must
 *   not be able to pull another repo's production database out of Eva.
 */
export function entityAccess(ctx: ActionCtx, credentials: McpCredentials) {
  const { scopedRepoId } = credentials;
  const isOrchestrator = credentials.isOrchestrator === true;

  /** The check the web mutations run: does this user reach this repo? */
  async function assertUserRepoAccess(
    repoId: string,
    userId: string,
  ): Promise<void> {
    const hasAccess = await ctx.runQuery(
      internal.mcp.queries.checkRepoAccessForUser,
      { repoId, userId },
    );
    if (!hasAccess) {
      throw new Error("Access denied: you do not have access to this repo.");
    }
  }

  /**
   * Credential-grade check: the user check plus the token pin. The master
   * session reaches every repo the user can reach, so the pin does not apply
   * to it.
   */
  async function assertRepoAccess(
    repoId: string,
    userId: string,
  ): Promise<void> {
    if (scopedRepoId && scopedRepoId !== repoId && !isOrchestrator) {
      throw new Error(
        "Access denied: this token is scoped to a different repository.",
      );
    }
    await assertUserRepoAccess(repoId, userId);
  }

  async function resolveRepoRef(
    ref: RepoRef,
    userId: string,
  ): Promise<{ repoId: string } | ReturnType<typeof errorResult>> {
    if (ref.repoId) return { repoId: ref.repoId };
    if (!ref.repoName) {
      return errorResult(
        "Provide either repoId (from list_repos) or repoName.",
      );
    }
    const repos = await mcpListUserRepos(ctx, userId);
    const matched = matchRepoByName(repos, ref.repoName, ref.app);
    if ("isError" in matched) return matched;
    return { repoId: matched.repo.id };
  }

  /**
   * Turns whichever reference the caller gave into one chat they may act on.
   * "No such chat" and "exists but you cannot reach it" come back as the same
   * sentence, so a stranger's id confirms nothing.
   */
  async function resolveEntityTarget(
    ref: EntityRef,
    userId: string,
  ): Promise<{ target: EntityTarget } | ReturnType<typeof errorResult>> {
    const { id, prUrl, numId, kind } = ref;
    if (id === undefined && prUrl === undefined && numId === undefined) {
      return errorResult(
        'Name the chat: pass "id", "prUrl", or "numId" with "kind" and "repoName".',
      );
    }
    if (id === undefined && prUrl === undefined && kind === undefined) {
      return errorResult(
        'A numId needs "kind" too ("session", "task" or "project"): each numbers its own rows, so 42 alone is ambiguous.',
      );
    }

    // Parsed here, not in the lookup, so a mistyped link gets a useful
    // sentence instead of a bare "nothing found".
    let canonicalPr: string | undefined;
    if (prUrl !== undefined) {
      const parsed = canonicalPrUrl(prUrl);
      if (parsed === null) {
        return errorResult(
          'prUrl must be a GitHub pull request link, e.g. "https://github.com/vvedantb/eva/pull/664".',
        );
      }
      canonicalPr = parsed;
    }

    // Only the numId path needs a repo — it is the one ref that is not unique
    // on its own.
    let scopeRepoId: string | undefined;
    if (id === undefined && canonicalPr === undefined) {
      const repo = await resolveRepoRef(ref, userId);
      if ("isError" in repo) return repo;
      scopeRepoId = repo.repoId;
    }

    const target = await ctx.runQuery(
      internal.mcp.queries.resolveChatTargetForUser,
      { userId, kind, id, numId, prUrl: canonicalPr, repoId: scopeRepoId },
    );
    if (!target) {
      return errorResult(
        "Nothing matched that reference, or you do not have access to it. A PR opened by a quick task resolves to that task, not a session.",
      );
    }

    // Re-checked per user (the lookup already filtered on access; this is the
    // belt for the braces). Deliberately not the token pin — see entityAccess.
    await assertUserRepoAccess(target.repoId, userId);

    return { target };
  }

  return {
    assertRepoAccess,
    assertUserRepoAccess,
    resolveRepoRef,
    resolveEntityTarget,
  };
}
