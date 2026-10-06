import { v, type Infer } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { hasRepoAccess, hasTaskAccess } from "../functions";
import { isEntityDeleted } from "../numId";

/**
 * The chat (session / quick task / project) a doc or artifact was created
 * from. One implementation for both tables: store it on create, check the
 * caller can see it, and resolve it to a display summary for lists.
 */

export const chatSourceArgValidator = v.union(
  v.object({ kind: v.literal("session"), sessionId: v.id("sessions") }),
  v.object({ kind: v.literal("task"), taskId: v.id("agentTasks") }),
  v.object({ kind: v.literal("project"), projectId: v.id("projects") }),
);
export type ChatSourceArg = Infer<typeof chatSourceArgValidator>;

export const chatSourceSummaryValidator = v.union(
  v.null(),
  v.object({
    kind: v.union(
      v.literal("session"),
      v.literal("task"),
      v.literal("project"),
    ),
    id: v.string(),
    title: v.string(),
    numId: v.optional(v.number()),
    owner: v.string(),
    repo: v.string(),
    rootDirectory: v.optional(v.string()),
  }),
);
type ChatSourceSummary = Infer<typeof chatSourceSummaryValidator>;

type ChatSourceStoredFields = {
  sourceKind?: "session" | "task" | "project";
  sourceSessionId?: Id<"sessions">;
  sourceTaskId?: Id<"agentTasks">;
  sourceProjectId?: Id<"projects">;
};

export type RepoCache = Map<string, Doc<"githubRepos"> | null>;

/**
 * Binds a create() source arg to stored fields, or skips a missing entity.
 * Throws when the caller cannot reach that chat; `noun` names the row in the
 * error ("document", "artifact").
 */
export async function chatSourceFieldsFromArg(
  ctx: { db: GenericDatabaseReader<DataModel>; userId: Id<"users"> },
  source: ChatSourceArg | undefined,
  noun: string,
): Promise<ChatSourceStoredFields> {
  if (source === undefined) return {};
  const denied = () =>
    new Error(`Not authorized to attach this ${noun} to that ${source.kind}.`);
  if (source.kind === "session") {
    const sessionId = ctx.db.normalizeId("sessions", String(source.sessionId));
    if (!sessionId) return {};
    const session = await ctx.db.get(sessionId);
    if (!session) return {};
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw denied();
    }
    return { sourceKind: "session", sourceSessionId: sessionId };
  }
  if (source.kind === "task") {
    const taskId = ctx.db.normalizeId("agentTasks", String(source.taskId));
    if (!taskId) return {};
    const task = await ctx.db.get(taskId);
    if (!task) return {};
    if (!(await hasTaskAccess(ctx.db, task, ctx.userId))) throw denied();
    return { sourceKind: "task", sourceTaskId: taskId };
  }
  const projectId = ctx.db.normalizeId("projects", String(source.projectId));
  if (!projectId) return {};
  const project = await ctx.db.get(projectId);
  if (!project) return {};
  if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) {
    throw denied();
  }
  return { sourceKind: "project", sourceProjectId: projectId };
}

/** True when the caller can open the chat (gates `listForSource`). */
export async function callerCanSeeChatSource(
  ctx: QueryCtx & { userId: Id<"users"> },
  source: ChatSourceArg,
): Promise<boolean> {
  if (source.kind === "session") {
    const session = await ctx.db.get(source.sessionId);
    return session
      ? await hasRepoAccess(ctx.db, session.repoId, ctx.userId)
      : false;
  }
  if (source.kind === "task") {
    const task = await ctx.db.get(source.taskId);
    return task ? await hasTaskAccess(ctx.db, task, ctx.userId) : false;
  }
  const project = await ctx.db.get(source.projectId);
  return project
    ? await hasRepoAccess(ctx.db, project.repoId, ctx.userId)
    : false;
}

async function repoFromCache(
  ctx: QueryCtx,
  repoId: Id<"githubRepos">,
  cache: RepoCache,
): Promise<Doc<"githubRepos"> | null> {
  const key = String(repoId);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const repo = await ctx.db.get(repoId);
  cache.set(key, repo);
  return repo;
}

function summarise(
  kind: "session" | "task" | "project",
  entity: { _id: string; title: string; numId?: number; deletedAt?: number },
  repo: Doc<"githubRepos"> | null,
): ChatSourceSummary {
  if (isEntityDeleted(entity) || repo === null) return null;
  return {
    kind,
    id: String(entity._id),
    title: entity.title,
    ...(entity.numId !== undefined ? { numId: entity.numId } : {}),
    owner: repo.owner,
    repo: repo.name,
    ...(repo.rootDirectory !== undefined
      ? { rootDirectory: repo.rootDirectory }
      : {}),
  };
}

async function summariseSession(
  ctx: QueryCtx,
  sessionId: Id<"sessions">,
  cache: RepoCache,
): Promise<ChatSourceSummary> {
  const session = await ctx.db.get(sessionId);
  if (!session) return null;
  return summarise(
    "session",
    session,
    await repoFromCache(ctx, session.repoId, cache),
  );
}

/**
 * Resolves a row's stored source to its display summary. `fallbackSessionId`
 * covers docs saved from a session Plan, which predate `sourceKind`.
 */
export async function resolveChatSource(
  ctx: QueryCtx,
  row: ChatSourceStoredFields,
  cache: RepoCache,
  fallbackSessionId?: Id<"sessions">,
): Promise<ChatSourceSummary> {
  if (row.sourceKind === "session" && row.sourceSessionId) {
    return summariseSession(ctx, row.sourceSessionId, cache);
  }
  if (row.sourceKind === "task" && row.sourceTaskId) {
    const task = await ctx.db.get(row.sourceTaskId);
    if (!task) return null;
    const repoId = task.repoId
      ? task.repoId
      : task.projectId
        ? (await ctx.db.get(task.projectId))?.repoId
        : undefined;
    if (!repoId) return null;
    return summarise("task", task, await repoFromCache(ctx, repoId, cache));
  }
  if (row.sourceKind === "project" && row.sourceProjectId) {
    const project = await ctx.db.get(row.sourceProjectId);
    if (!project) return null;
    return summarise(
      "project",
      project,
      await repoFromCache(ctx, project.repoId, cache),
    );
  }
  if (fallbackSessionId) {
    return summariseSession(ctx, fallbackSessionId, cache);
  }
  return null;
}

/** Rows of `table` created from one chat, via its `by_source_*` index. */
export function listRowsForChatSource(
  ctx: QueryCtx,
  table: "docs",
  source: ChatSourceArg,
): Promise<Doc<"docs">[]>;
export function listRowsForChatSource(
  ctx: QueryCtx,
  table: "artifacts",
  source: ChatSourceArg,
): Promise<Doc<"artifacts">[]>;
export async function listRowsForChatSource(
  ctx: QueryCtx,
  table: "docs" | "artifacts",
  source: ChatSourceArg,
): Promise<Doc<"docs" | "artifacts">[]> {
  const query = ctx.db.query(table);
  if (source.kind === "session") {
    return query
      .withIndex("by_source_session", (q) =>
        q.eq("sourceSessionId", source.sessionId),
      )
      .order("desc")
      .collect();
  }
  if (source.kind === "task") {
    return query
      .withIndex("by_source_task", (q) => q.eq("sourceTaskId", source.taskId))
      .order("desc")
      .collect();
  }
  return query
    .withIndex("by_source_project", (q) =>
      q.eq("sourceProjectId", source.projectId),
    )
    .order("desc")
    .collect();
}
