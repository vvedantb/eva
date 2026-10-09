import { internalQuery, type QueryCtx } from "../_generated/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { gatherAccessibleRepos } from "../_githubRepos/helpers";
import { hasRepoAccess } from "../functions";
import { entityVisible, filterActiveEntities } from "../numId";
import {
  chatEntityKindValidator,
  prOriginValidator,
  prStateValidator,
  type ChatEntityKind,
} from "../validators";
import {
  findPullRequestByUrl,
  listOwnerPullRequests,
  sessionRepoPullRequest,
  taskPrUrl,
  type PrOwnerRef,
} from "../_pullRequests/store";
import {
  openChatEntityIdsFor,
  openChatEntityIdsForRepo,
  projectIsExecuting,
  sessionIsExecuting,
  taskIsExecuting,
} from "../_chat/turnProjection";
import {
  findRepoEnvVarDoc,
  findTeamEnvVarDoc,
} from "../_envVars/documentStore";

/** Checks whether a user has access to a repo (via ownership or team membership). */
export const checkRepoAccessForUser = internalQuery({
  args: { repoId: v.string(), userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const repoId = ctx.db.normalizeId("githubRepos", args.repoId);
    const userId = ctx.db.normalizeId("users", args.userId);
    return repoId && userId ? hasRepoAccess(ctx.db, repoId, userId) : false;
  },
});

/** Repos a user can reach (hidden included), in the shape MCP tools report. */
export const listUserRepos = internalQuery({
  args: { userId: v.string() },
  returns: v.array(
    v.object({
      id: v.string(),
      owner: v.string(),
      name: v.string(),
      rootDirectory: v.union(v.string(), v.null()),
      mcpRootPrompt: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!userId) return [];
    const repos = await gatherAccessibleRepos(ctx.db, userId, true);
    return repos.map((repo) => ({
      id: repo._id,
      owner: repo.owner,
      name: repo.name,
      rootDirectory: repo.rootDirectory ?? null,
      mcpRootPrompt: repo.mcpRootPrompt ?? null,
    }));
  },
});

/** Teams a user belongs to. */
export const listUserTeams = internalQuery({
  args: { userId: v.string() },
  returns: v.array(v.object({ id: v.string(), name: v.string() })),
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!userId) return [];
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const teams = await Promise.all(
      memberships.map((m) => ctx.db.get(m.teamId)),
    );
    return teams.flatMap((team) =>
      team ? [{ id: team._id, name: team.name }] : [],
    );
  },
});

/**
 * A chat an MCP caller named, before any access check. The three surfaces are
 * separate tables, so the ref search yields a discriminated hit rather than a
 * common document type.
 */
type ChatTargetHit =
  | { kind: "session"; doc: Doc<"sessions"> }
  | { kind: "task"; doc: Doc<"agentTasks"> }
  | { kind: "project"; doc: Doc<"projects"> };

/** Kinds to search, in the order a bare reference most likely means. */
const KIND_SEARCH_ORDER = ["session", "task", "project"] as const;

function kindsToSearch(kind: string | undefined): readonly ChatEntityKind[] {
  if (kind === undefined) return KIND_SEARCH_ORDER;
  return KIND_SEARCH_ORDER.filter((candidate) => candidate === kind);
}

/**
 * Loads a chat target by Convex id. A Convex id encodes its table, so
 * `normalizeId` rejects an id from another table outright — trying each kind
 * in turn is a lookup, not a guess.
 */
async function findById(
  ctx: QueryCtx,
  id: string,
  kinds: readonly ChatEntityKind[],
): Promise<ChatTargetHit | null> {
  for (const kind of kinds) {
    if (kind === "session") {
      const sessionId = ctx.db.normalizeId("sessions", id);
      const doc = sessionId ? await ctx.db.get(sessionId) : null;
      if (doc) return { kind, doc };
    } else if (kind === "task") {
      const taskId = ctx.db.normalizeId("agentTasks", id);
      const doc = taskId ? await ctx.db.get(taskId) : null;
      if (doc) return { kind, doc };
    } else {
      const projectId = ctx.db.normalizeId("projects", id);
      const doc = projectId ? await ctx.db.get(projectId) : null;
      if (doc) return { kind, doc };
    }
  }
  return null;
}

/**
 * Finds the chat a pull request is linked to, through its `pullRequests` row,
 * so any PR an owner holds resolves — a linked repo's, a side-branch PR the
 * agent opened, or an earlier PR of a task or project.
 */
async function findByPrUrl(
  ctx: QueryCtx,
  prUrl: string,
  kinds: readonly ChatEntityKind[],
): Promise<ChatTargetHit | null> {
  const row = await findPullRequestByUrl(ctx.db, prUrl);
  if (!row || !kinds.includes(row.owner.kind)) return null;
  const owner = row.owner;
  if (owner.kind === "session") {
    const doc = await ctx.db.get(owner.sessionId);
    return doc ? { kind: "session", doc } : null;
  }
  if (owner.kind === "task") {
    const doc = await ctx.db.get(owner.taskId);
    return doc ? { kind: "task", doc } : null;
  }
  const doc = await ctx.db.get(owner.projectId);
  return doc ? { kind: "project", doc } : null;
}

/**
 * Finds a chat by the number in its Eva url. A numId is unique only inside one
 * repo AND one kind (session 42 and task 42 both exist), so both must be
 * known: an unresolvable repo is a miss rather than a repo-wide scan.
 */
async function findByNumId(
  ctx: QueryCtx,
  numId: number,
  rawRepoId: string | undefined,
  kinds: readonly ChatEntityKind[],
): Promise<ChatTargetHit | null> {
  const repoId = rawRepoId
    ? ctx.db.normalizeId("githubRepos", rawRepoId)
    : null;
  if (!repoId || kinds.length !== 1) return null;
  const [kind] = kinds;

  if (kind === "session") {
    const doc = await ctx.db
      .query("sessions")
      .withIndex("by_repo_and_numId", (q) =>
        q.eq("repoId", repoId).eq("numId", numId),
      )
      .first();
    return doc ? { kind, doc } : null;
  }
  if (kind === "task") {
    const doc = await ctx.db
      .query("agentTasks")
      .withIndex("by_repo_and_numId", (q) =>
        q.eq("repoId", repoId).eq("numId", numId),
      )
      .first();
    return doc ? { kind, doc } : null;
  }
  const doc = await ctx.db
    .query("projects")
    .withIndex("by_repo_and_numId", (q) =>
      q.eq("repoId", repoId).eq("numId", numId),
    )
    .first();
  return doc ? { kind: "project", doc } : null;
}

/**
 * Finds the chat an MCP caller named, before any access check. One ref wins at
 * a time, in the order the caller is most likely to have been precise:
 * explicit id, then PR link, then the per-repo number from the url.
 */
async function findChatTargetByRef(
  ctx: QueryCtx,
  ref: {
    kind?: string;
    id?: string;
    prUrl?: string;
    numId?: number;
    repoId?: string;
  },
): Promise<ChatTargetHit | null> {
  const kinds = kindsToSearch(ref.kind);
  if (kinds.length === 0) return null;
  if (ref.id !== undefined) return await findById(ctx, ref.id, kinds);
  if (ref.prUrl !== undefined) return await findByPrUrl(ctx, ref.prUrl, kinds);
  if (ref.numId !== undefined) {
    return await findByNumId(ctx, ref.numId, ref.repoId, kinds);
  }
  return null;
}

/** The repo a hit belongs to. A task inherits its project's when it has none. */
async function targetRepoId(
  ctx: QueryCtx,
  hit: ChatTargetHit,
): Promise<Id<"githubRepos"> | null> {
  if (hit.kind === "session" || hit.kind === "project") return hit.doc.repoId;
  if (hit.doc.repoId) return hit.doc.repoId;
  if (hit.doc.projectId) {
    const project = await ctx.db.get(hit.doc.projectId);
    return project?.repoId ?? null;
  }
  return null;
}

/**
 * Resolves a chat the MCP user may act on — a session, a quick task's sandbox
 * chat, or a project's sandbox chat — by Convex id, GitHub PR url, or per-repo
 * numId. Returns null for "no such chat" AND for "exists but this user cannot
 * reach its repo" — the two are deliberately indistinguishable to the caller,
 * so a stranger's id leaks nothing.
 *
 * `prUrl` must already be canonical (see `mcp/sessionRef.ts`); the lookup is an
 * exact index match.
 */
export const resolveChatTargetForUser = internalQuery({
  args: {
    userId: v.string(),
    /** Restricts the search to one surface. Required alongside `numId`. */
    kind: v.optional(chatEntityKindValidator),
    id: v.optional(v.string()),
    numId: v.optional(v.number()),
    prUrl: v.optional(v.string()),
    repoId: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      kind: chatEntityKindValidator,
      targetId: v.string(),
      numId: v.optional(v.number()),
      title: v.string(),
      status: v.string(),
      prUrl: v.optional(v.string()),
      branchName: v.optional(v.string()),
      repoId: v.id("githubRepos"),
      repoOwner: v.string(),
      repoName: v.string(),
      repoRootDirectory: v.optional(v.string()),
      /** Preview VM state, `"closed"` when the entity has never started one. */
      sandboxStatus: v.string(),
      /** The VM itself, absent until the entity has had one. */
      sandboxId: v.optional(v.string()),
      /** Port the app dev server listens on, entity setting before repo default. */
      devPort: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!userId) return null;

    const hit = await findChatTargetByRef(ctx, args);
    if (!hit || !entityVisible(hit.doc)) return null;

    const repoId = await targetRepoId(ctx, hit);
    if (!repoId) return null;
    if (!(await hasRepoAccess(ctx.db, repoId, userId))) return null;

    const repo = await ctx.db.get(repoId);
    if (!repo) return null;

    const doc = hit.doc;
    return {
      kind: hit.kind,
      targetId: doc._id,
      numId: doc.numId,
      title: doc.title,
      // A project tracks a phase where the other two track a status; both
      // answer the same "where is this up to" question for the caller.
      status: hit.kind === "project" ? hit.doc.phase : hit.doc.status,
      prUrl: hit.doc.prUrl,
      branchName: hit.kind === "task" ? undefined : hit.doc.branchName,
      repoId,
      repoOwner: repo.owner,
      repoName: repo.name,
      repoRootDirectory: repo.rootDirectory,
      // A session's own status IS its sandbox's; the other two park the
      // reviewer-facing VM state in their own field (see list_entities).
      sandboxStatus:
        hit.kind === "session"
          ? hit.doc.status
          : hit.kind === "task"
            ? (hit.doc.reviewTaskSandboxStatus ?? "closed")
            : (hit.doc.reviewProjectSandboxStatus ?? "closed"),
      sandboxId: doc.sandboxId,
      devPort: doc.devPort ?? repo.devPort,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// list_entities
//
// One page across the three chat surfaces, so an MCP caller can see what
// already exists (and skip creating a duplicate) without reading three tables
// itself. Read-only: it never touches status or review state.
// ─────────────────────────────────────────────────────────────────────────────

/** Hard ceiling on rows returned, whatever the caller asks for. */
const MAX_ENTITY_PAGE = 50;

/**
 * Documents the scan may read across every repo and kind. Session/task/project
 * rows carry terminal tails and descriptions, so an unbounded sweep over a
 * user's whole fleet would blow the query's read limit. The budget is split
 * evenly across (repo x kind) rather than spent front to back, so a caller with
 * six repos still hears about all six.
 */
const ENTITY_SCAN_BUDGET = 300;

const listedEntityValidator = v.object({
  kind: chatEntityKindValidator,
  id: v.string(),
  numId: v.optional(v.number()),
  title: v.string(),
  /** Lifecycle: a session's sandbox status, a task's status, a project's phase. */
  status: v.string(),
  /** Preview VM state, `"closed"` when the entity has never started one. */
  sandboxStatus: v.string(),
  isExecuting: v.boolean(),
  archived: v.optional(v.boolean()),
  /** The primary PR (else the newest) — see `prUrls` for the rest. */
  prUrl: v.optional(v.string()),
  /** Every PR linked to the entity, only when it holds more than one. */
  prUrls: v.optional(v.array(v.string())),
  branchName: v.optional(v.string()),
  updatedAt: v.number(),
  repoId: v.id("githubRepos"),
  repoOwner: v.string(),
  repoName: v.string(),
  repoRootDirectory: v.optional(v.string()),
  /** Sessions only, and only when it has linked repos beside its primary. */
  linkedRepoCount: v.optional(v.number()),
});

type ListedEntity = Infer<typeof listedEntityValidator>;

const SESSION_STATUSES = ["active", "starting", "stopping", "closed"] as const;

const TASK_STATUSES = [
  "draft",
  "todo",
  "in_progress",
  "code_review",
  "business_review",
  "done",
  "cancelled",
] as const;

const PROJECT_PHASES = [
  "draft",
  "finalized",
  "in_progress",
  "business_review",
  "code_review",
  "completed",
  "cancelled",
] as const;

/**
 * Narrows the caller's free-text status onto one kind's own vocabulary, so the
 * per-status index can be used without an assertion. A status that belongs to
 * another kind simply matches nothing there, which is the honest answer.
 */
function asSessionStatus(
  status: string,
): (typeof SESSION_STATUSES)[number] | undefined {
  return SESSION_STATUSES.find((candidate) => candidate === status);
}

function asTaskStatus(
  status: string,
): (typeof TASK_STATUSES)[number] | undefined {
  return TASK_STATUSES.find((candidate) => candidate === status);
}

function asProjectPhase(
  status: string,
): (typeof PROJECT_PHASES)[number] | undefined {
  return PROJECT_PHASES.find((candidate) => candidate === status);
}

/**
 * Rows to take per (repo, kind) so the whole budget is not spent on the first
 * repo. Returns at most `limit`, and never less than one, so every repo the
 * caller can reach contributes something.
 */
function rowsPerScan(
  limit: number,
  repoCount: number,
  kindCount: number,
): number {
  const scans = Math.max(repoCount * kindCount, 1);
  return Math.max(1, Math.min(limit, Math.floor(ENTITY_SCAN_BUDGET / scans)));
}

/** Most recent sessions in one repo, newest first, optionally one status only. */
async function scanSessions(
  ctx: QueryCtx,
  repoId: Id<"githubRepos">,
  status: string | undefined,
  take: number,
): Promise<Doc<"sessions">[]> {
  if (status !== undefined) {
    const narrowed = asSessionStatus(status);
    if (narrowed === undefined) return [];
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_repo_and_status", (q) =>
        q.eq("repoId", repoId).eq("status", narrowed),
      )
      .order("desc")
      .take(take);
    return filterActiveEntities(rows);
  }
  return ctx.db
    .query("sessions")
    .withIndex("by_repo_and_deleted", (q) =>
      q.eq("repoId", repoId).eq("deletedAt", undefined),
    )
    .order("desc")
    .take(take);
}

async function scanTasks(
  ctx: QueryCtx,
  repoId: Id<"githubRepos">,
  status: string | undefined,
  take: number,
): Promise<Doc<"agentTasks">[]> {
  if (status !== undefined) {
    const narrowed = asTaskStatus(status);
    if (narrowed === undefined) return [];
    return ctx.db
      .query("agentTasks")
      .withIndex("by_repo_status_and_deleted", (q) =>
        q
          .eq("repoId", repoId)
          .eq("status", narrowed)
          .eq("deletedAt", undefined),
      )
      .order("desc")
      .take(take);
  }
  // Tasks are the one surface with an updatedAt index, which is also the order
  // the merged page is sorted by.
  const rows = await ctx.db
    .query("agentTasks")
    .withIndex("by_repo_and_updatedAt", (q) => q.eq("repoId", repoId))
    .order("desc")
    .take(take);
  return filterActiveEntities(rows);
}

async function scanProjects(
  ctx: QueryCtx,
  repoId: Id<"githubRepos">,
  status: string | undefined,
  take: number,
): Promise<Doc<"projects">[]> {
  if (status !== undefined) {
    const narrowed = asProjectPhase(status);
    if (narrowed === undefined) return [];
    const rows = await ctx.db
      .query("projects")
      .withIndex("by_repo_and_phase", (q) =>
        q.eq("repoId", repoId).eq("phase", narrowed),
      )
      .order("desc")
      .take(take);
    return filterActiveEntities(rows);
  }
  return ctx.db
    .query("projects")
    .withIndex("by_repo_and_deleted", (q) =>
      q.eq("repoId", repoId).eq("deletedAt", undefined),
    )
    .order("desc")
    .take(take);
}

type RepoRow = Pick<
  Doc<"githubRepos">,
  "_id" | "owner" | "name" | "rootDirectory"
>;

function repoColumns(repo: RepoRow) {
  return {
    repoId: repo._id,
    repoOwner: repo.owner,
    repoName: repo.name,
    repoRootDirectory: repo.rootDirectory,
  };
}

/**
 * Lists the sessions, quick tasks and projects a user can reach, newest
 * activity first. Access is re-checked per repo, so passing a repo id the
 * caller cannot reach drops it silently rather than leaking its contents.
 *
 * Two deliberate boundaries, both reported through `truncated` rather than
 * papered over:
 *
 * - The scan is per repo, so a project's child task that carries no `repoId`
 *   of its own is not listed — the same boundary `list_agents` draws. Such a
 *   task stays reachable by id through every other entity tool.
 * - Only quick tasks have a `by_repo_and_updatedAt` index, so the per-repo
 *   take for sessions and projects is newest-created rather than
 *   newest-updated. The merged page is still ordered by last activity; a
 *   long-idle session touched seconds ago can fall outside a repo whose page
 *   is full. `truncated` is set whenever the scan could not cover everything.
 */
export const listEntitiesForUser = internalQuery({
  args: {
    userId: v.string(),
    /** Repos to scan. Already narrowed by the tool to the caller's own repos. */
    repoIds: v.array(v.string()),
    kind: v.optional(chatEntityKindValidator),
    status: v.optional(v.string()),
    limit: v.number(),
  },
  returns: v.object({
    entities: v.array(listedEntityValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!userId) return { entities: [], truncated: false };

    const limit = Math.min(
      Math.max(Math.trunc(args.limit), 1),
      MAX_ENTITY_PAGE,
    );
    const kinds = kindsToSearch(args.kind);
    const repoIds = args.repoIds
      .map((rawRepoId) => ctx.db.normalizeId("githubRepos", rawRepoId))
      .filter((repoId) => repoId !== null);
    const take = rowsPerScan(limit, repoIds.length, kinds.length);
    const rows: ListedEntity[] = [];

    for (const repoId of repoIds) {
      if (!(await hasRepoAccess(ctx.db, repoId, userId))) continue;
      const repo = await ctx.db.get(repoId);
      if (!repo) continue;
      const columns = repoColumns(repo);
      const openChatEntityIds = await openChatEntityIdsForRepo(ctx.db, repoId);

      for (const kind of kinds) {
        if (kind === "session") {
          const docs = await scanSessions(ctx, repoId, args.status, take);
          for (const doc of docs) {
            rows.push({
              kind,
              id: doc._id,
              numId: doc.numId,
              title: doc.title,
              // A session has one status and it is its sandbox's, so both
              // columns read the same field rather than inventing a second.
              status: doc.status,
              sandboxStatus: doc.status,
              isExecuting: sessionIsExecuting(doc, openChatEntityIds),
              archived: doc.archived,
              prUrl: doc.prUrl,
              branchName: doc.branchName,
              updatedAt: doc.updatedAt ?? doc._creationTime,
              linkedRepoCount: doc.linkedRepoCount,
              ...columns,
            });
          }
          continue;
        }

        if (kind === "task") {
          const docs = await scanTasks(ctx, repoId, args.status, take);
          for (const doc of docs) {
            rows.push({
              kind,
              id: doc._id,
              numId: doc.numId,
              title: doc.title,
              status: doc.status,
              sandboxStatus: doc.reviewTaskSandboxStatus ?? "closed",
              isExecuting: taskIsExecuting(doc, openChatEntityIds),
              updatedAt: doc.updatedAt,
              ...columns,
            });
          }
          continue;
        }

        const docs = await scanProjects(ctx, repoId, args.status, take);
        for (const doc of docs) {
          rows.push({
            kind,
            id: doc._id,
            numId: doc.numId,
            title: doc.title,
            status: doc.phase,
            sandboxStatus: doc.reviewProjectSandboxStatus ?? "closed",
            isExecuting: projectIsExecuting(doc, openChatEntityIds),
            prUrl: doc.prUrl,
            branchName: doc.branchName,
            updatedAt: doc.updatedAt ?? doc._creationTime,
            ...columns,
          });
        }
      }
    }

    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    const page = rows.slice(0, limit);

    // Only the page that is actually returned pays for the PR lookups.
    const entities = await Promise.all(
      page.map(async (row) => {
        const owner = chatTargetOwner(ctx, row.kind, row.id);
        if (owner === null) return row;
        const prs = await listOwnerPullRequests(ctx.db, owner);
        const withTaskPr =
          owner.kind === "task" && row.prUrl === undefined
            ? await taskPrUrlById(ctx, owner.taskId)
            : row.prUrl;
        return {
          ...row,
          prUrl: withTaskPr,
          ...(prs.length > 1 ? { prUrls: prs.map((pr) => pr.prUrl) } : {}),
        };
      }),
    );

    // `take < limit` means the budget forced a partial scan of at least one
    // repo, so "more exists" is true even when fewer than `limit` rows came
    // back. Saying so beats a short page that reads as the whole picture.
    return { entities, truncated: rows.length > limit || take < limit };
  },
});

/**
 * Whether one entity has a turn in flight, by the same rule the app's own list
 * uses. `stop_sandbox` reads this before tearing a VM down: a session running a
 * daemon-minted continuation (`/loop`) never gets an `activeWorkflowId`, so
 * keying the refusal off that field alone would stop the VM under a live turn.
 *
 * The caller has already proven access to `id` by reading the entity as the
 * user; this only adds the turn lookup that read cannot do.
 */
export const entityIsExecuting = internalQuery({
  args: { kind: chatEntityKindValidator, id: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { kind, id }) => {
    if (kind === "session") {
      const sessionId = ctx.db.normalizeId("sessions", id);
      if (!sessionId) return false;
      const session = await ctx.db.get(sessionId);
      if (!session) return false;
      return sessionIsExecuting(
        session,
        await openChatEntityIdsFor(ctx.db, sessionId),
      );
    }
    if (kind === "task") {
      const taskId = ctx.db.normalizeId("agentTasks", id);
      if (!taskId) return false;
      const task = await ctx.db.get(taskId);
      return task
        ? taskIsExecuting(task, await openChatEntityIdsFor(ctx.db, taskId))
        : false;
    }
    const projectId = ctx.db.normalizeId("projects", id);
    if (!projectId) return false;
    const project = await ctx.db.get(projectId);
    return project
      ? projectIsExecuting(
          project,
          await openChatEntityIdsFor(ctx.db, projectId),
        )
      : false;
  },
});

/** Env var key that holds a repo's Postgres read-replica connection string. */
const POSTGRES_REPLICA_ENV_KEY = "POSTGRES_READ_REPLICA_URL";

/**
 * Given a list of repo IDs, returns the subset that have a
 * POSTGRES_READ_REPLICA_URL env var configured at the repo or (inherited) team
 * level. Used by `list_repos` to advertise which repos support `postgres_query`.
 *
 * Checks key presence only — it never reads or decrypts the value, and team
 * lookups are memoised so a shared team is only queried once.
 */
export const reposWithPostgresReplica = internalQuery({
  args: { repoIds: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, { repoIds }): Promise<string[]> => {
    const teamHasKey = new Map<string, boolean>();
    const matches: string[] = [];

    for (const rawId of repoIds) {
      // normalizeId turns the caller's string back into a typed Id (or null
      // for anything malformed) without an `as` cast.
      const repoId = ctx.db.normalizeId("githubRepos", rawId);
      if (!repoId) continue;

      const repoVars = await findRepoEnvVarDoc(ctx.db, repoId);
      if (repoVars?.vars.some((e) => e.key === POSTGRES_REPLICA_ENV_KEY)) {
        matches.push(rawId);
        continue;
      }

      const repo = await ctx.db.get(repoId);
      const teamId = repo?.teamId;
      if (!teamId) continue;

      let teamHas = teamHasKey.get(teamId);
      if (teamHas === undefined) {
        const teamVars = await findTeamEnvVarDoc(ctx.db, teamId);
        teamHas =
          teamVars?.vars.some((e) => e.key === POSTGRES_REPLICA_ENV_KEY) ??
          false;
        teamHasKey.set(teamId, teamHas);
      }
      if (teamHas) matches.push(rawId);
    }

    return matches;
  },
});

/** The pull-request owner a listed row names, or null for a malformed id. */
function chatTargetOwner(
  ctx: QueryCtx,
  kind: ChatEntityKind,
  id: string,
): PrOwnerRef | null {
  if (kind === "session") {
    const sessionId = ctx.db.normalizeId("sessions", id);
    return sessionId ? { kind, sessionId } : null;
  }
  if (kind === "task") {
    const taskId = ctx.db.normalizeId("agentTasks", id);
    return taskId ? { kind, taskId } : null;
  }
  const projectId = ctx.db.normalizeId("projects", id);
  return projectId ? { kind, projectId } : null;
}

/** A task's PR: its own summary, or its project's for a project task. */
async function taskPrUrlById(
  ctx: QueryCtx,
  taskId: Id<"agentTasks">,
): Promise<string | undefined> {
  const task = await ctx.db.get(taskId);
  return task ? await taskPrUrl(ctx.db, task) : undefined;
}

/** One pull request linked to a chat, as reported over MCP. */
export const mcpPullRequestValidator = v.object({
  url: v.string(),
  number: v.number(),
  state: prStateValidator,
  branch: v.optional(v.string()),
  /** The chat's own PR — the one Eva opened for its branch. */
  primary: v.boolean(),
  /** "eva" when Eva's flow opened it; "agent" for one opened on a side branch. */
  openedBy: prOriginValidator,
});

/** Every PR a chat holds, primary first, then newest first. */
export function toMcpPullRequests(
  rows: readonly Doc<"pullRequests">[],
): Infer<typeof mcpPullRequestValidator>[] {
  return [...rows]
    .sort((a, b) => Number(b.primary) - Number(a.primary))
    .map((pr) => ({
      url: pr.prUrl,
      number: pr.prNumber,
      state: pr.state,
      branch: pr.headBranch,
      primary: pr.primary,
      openedBy: pr.origin,
    }));
}

/** `get_agent_state`'s PR list; takes plain strings like the action holds. */
export const chatPullRequests = internalQuery({
  args: { kind: chatEntityKindValidator, id: v.string() },
  returns: v.array(mcpPullRequestValidator),
  handler: async (ctx, { kind, id }) => {
    const owner = chatTargetOwner(ctx, kind, id);
    if (owner === null) return [];
    return toMcpPullRequests(await listOwnerPullRequests(ctx.db, owner));
  },
});

/** One extra repo cloned into a session's sandbox, as reported over MCP. */
export const mcpLinkedRepoValidator = v.object({
  repo: v.string(),
  path: v.string(),
  branch: v.string(),
  prUrl: v.optional(v.string()),
  prState: v.optional(prStateValidator),
});

export type McpLinkedRepo = Infer<typeof mcpLinkedRepoValidator>;

/**
 * The linked repos cloned into one session's sandbox beside its primary, for
 * `create_session`'s result and `get_agent_state`'s session summary. Takes a
 * plain string so an action holding an untyped id parsed off a JSON response
 * can call it directly.
 */
export const sessionLinkedRepos = internalQuery({
  args: { sessionId: v.string() },
  returns: v.array(mcpLinkedRepoValidator),
  handler: async (ctx, { sessionId }): Promise<McpLinkedRepo[]> => {
    const id = ctx.db.normalizeId("sessions", sessionId);
    if (!id) return [];
    const links = await ctx.db
      .query("sessionRepos")
      .withIndex("by_session", (q) => q.eq("sessionId", id))
      .collect();
    const prs = await listOwnerPullRequests(ctx.db, {
      kind: "session",
      sessionId: id,
    });
    return links.map((link) => {
      const pr = sessionRepoPullRequest(prs, link._id);
      return {
        repo: `${link.owner}/${link.name}`,
        path: link.path,
        branch: link.branchName,
        prUrl: pr?.prUrl,
        prState: pr?.state,
      };
    });
  },
});
