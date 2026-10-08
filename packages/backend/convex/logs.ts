import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { authQuery, hasRepoAccess } from "./functions";
import {
  buildTaskProjectIdLookup,
  resolveLogProjectId,
} from "./_logs/resolveProjectId";
import { deriveLogUsage } from "./_logs/usage";
import { logUsageFields } from "./_validators/tableFields";

/** Denormalised usage columns copied onto every log DTO. */
function usageOf(entry: Doc<"logs">) {
  return {
    costUsd: entry.costUsd,
    model: entry.model,
    provider: entry.provider,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    cacheReadTokens: entry.cacheReadTokens,
    cacheCreationTokens: entry.cacheCreationTokens,
    durationMs: entry.durationMs,
    contextWindow: entry.contextWindow,
  };
}

function toLogDto(entry: Doc<"logs">, projectId: Id<"projects"> | undefined) {
  return {
    _id: entry._id,
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityTitle: entry.entityTitle,
    rawResultEvent: entry.rawResultEvent,
    projectId,
    createdAt: entry.createdAt,
    ...usageOf(entry),
  };
}

const logDtoValidator = v.object({
  _id: v.id("logs"),
  entityType: v.string(),
  entityId: v.string(),
  entityTitle: v.string(),
  rawResultEvent: v.optional(v.string()),
  projectId: v.optional(v.id("projects")),
  createdAt: v.number(),
  ...logUsageFields,
});

/** Inserts a new log entry for a repo entity (internal use only). */
export const log = internalMutation({
  args: {
    entityType: v.string(),
    entityId: v.string(),
    entityTitle: v.string(),
    rawResultEvent: v.optional(v.string()),
    repoId: v.id("githubRepos"),
    projectId: v.optional(v.id("projects")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("logs", {
      entityType: args.entityType,
      entityId: args.entityId,
      entityTitle: args.entityTitle,
      rawResultEvent: args.rawResultEvent,
      repoId: args.repoId,
      projectId: args.projectId,
      createdAt: Date.now(),
      ...deriveLogUsage(args.rawResultEvent),
    });
    return null;
  },
});

/** Gets all log entries for a specific entity (task, session, etc.). */
export const getByEntityId = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    entityId: v.string(),
  },
  returns: v.array(logDtoValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return [];
    }

    const logs = await ctx.db
      .query("logs")
      .withIndex("by_repo_and_entity", (q) =>
        q.eq("repoId", args.repoId).eq("entityId", args.entityId),
      )
      .order("desc")
      .collect();

    return logs.map((entry) => toLogDto(entry, entry.projectId));
  },
});

/** Gets all log entries that belong to a project. Covers project chats and
 *  any project-scoped tasks (quickTask, task-chat) tagged with this
 *  projectId, so callers can aggregate the project's full usage. */
export const getByProjectId = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    projectId: v.id("projects"),
  },
  returns: v.array(logDtoValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return [];
    }
    // Confirm the project lives in the repo the caller is asking about — the
    // by_project index alone would otherwise leak logs across repos.
    const project = await ctx.db.get(args.projectId);
    if (!project || project.repoId !== args.repoId) {
      return [];
    }

    const tagged = await ctx.db
      .query("logs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const seenIds = new Set(tagged.map((entry) => String(entry._id)));
    const untagged: Doc<"logs">[] = [];

    for (const task of tasks) {
      const taskLogs = await ctx.db
        .query("logs")
        .withIndex("by_repo_and_entity", (q) =>
          q.eq("repoId", args.repoId).eq("entityId", String(task._id)),
        )
        .collect();
      for (const entry of taskLogs) {
        if (entry.projectId !== undefined) continue;
        const id = String(entry._id);
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        untagged.push(entry);
      }
    }

    const combined = [...tagged, ...untagged];
    const projectByTaskId = await buildTaskProjectIdLookup(ctx, combined);

    const resolved = combined.flatMap((entry) => {
      const projectId = resolveLogProjectId(ctx, entry, projectByTaskId);
      if (projectId !== args.projectId) return [];
      return [toLogDto(entry, projectId)];
    });

    return resolved.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Lists log entries for a repo, optionally filtered by start time. */
export const listByRepo = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    startTime: v.optional(v.number()),
  },
  returns: v.array(logDtoValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return [];
    }

    const all = await ctx.db
      .query("logs")
      .withIndex("by_repo_and_created", (q) => {
        const base = q.eq("repoId", args.repoId);
        return args.startTime !== undefined
          ? base.gte("createdAt", args.startTime)
          : base;
      })
      .order("desc")
      .collect();

    const projectByTaskId = await buildTaskProjectIdLookup(ctx, all);

    return all.map((entry) =>
      toLogDto(entry, resolveLogProjectId(ctx, entry, projectByTaskId)),
    );
  },
});

/** Lists log entries grouped by project for a repo. Returns project metadata
 *  alongside an aggregated cost total so the UI can show per-project spending. */
export const listByProject = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    startTime: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      projectId: v.id("projects"),
      projectTitle: v.string(),
      logs: v.array(logDtoValidator),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return [];
    }

    const all = await ctx.db
      .query("logs")
      .withIndex("by_repo_and_created", (q) => {
        const base = q.eq("repoId", args.repoId);
        return args.startTime !== undefined
          ? base.gte("createdAt", args.startTime)
          : base;
      })
      .order("desc")
      .collect();

    const projectByTaskId = await buildTaskProjectIdLookup(ctx, all);

    const projectTitles = new Map<string, string>();

    type LogEntry = ReturnType<typeof toLogDto>;

    const groups = new Map<
      string,
      { projectId: Id<"projects">; logs: LogEntry[] }
    >();

    for (const entry of all) {
      const projectId = resolveLogProjectId(ctx, entry, projectByTaskId);
      if (projectId === undefined) continue;
      const pidStr = String(projectId);
      if (!projectTitles.has(pidStr)) {
        const project = await ctx.db.get(projectId);
        if (!project) continue;
        projectTitles.set(pidStr, project.title);
      }
      const logEntry: LogEntry = toLogDto(entry, projectId);
      const existing = groups.get(pidStr);
      if (existing) {
        existing.logs.push(logEntry);
      } else {
        groups.set(pidStr, {
          projectId,
          logs: [logEntry],
        });
      }
    }

    return Array.from(groups.values()).map((data) => ({
      projectId: data.projectId,
      projectTitle:
        projectTitles.get(String(data.projectId)) ?? "Unknown Project",
      logs: data.logs,
    }));
  },
});
