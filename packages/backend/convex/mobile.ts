import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { authQuery, hasRepoAccess } from "./functions";
import { gatherAccessibleRepos } from "./_githubRepos/helpers";
import { findMainChat, loadSessionChat } from "./_sessionChats/helpers";
import { getRepoHref } from "./notifications";
import { aiModelValidator, sessionStatusValidator } from "./validators";

/**
 * Read models for the Eva mobile app (apps/mobile). The app opens every chat
 * by one string `target`: a session chat, session, quick task or project id,
 * the same id push notifications and `notifications.chatTarget` carry.
 */

/** Sessions shown per repo; the list is "what is going on now", not history. */
const SESSIONS_PER_REPO = 25;
/** Rows in the whole chat list. */
const CHAT_LIST_LIMIT = 60;

const chatKindValidator = v.union(
  v.literal("session"),
  v.literal("task"),
  v.literal("project"),
);

const mobileChatValidator = v.object({
  kind: chatKindValidator,
  title: v.string(),
  repoLabel: v.string(),
  /** The chat's id for `messages.listByParent`, `turns` and `pendingQuestions`. */
  parentId: v.union(v.id("sessionChats"), v.id("projects"), v.id("agentTasks")),
  /** Set when the app can reply; quick tasks and projects are read-only in v1. */
  replyChatId: v.optional(v.id("sessionChats")),
  /** The chat's sticky model, for the reply. */
  model: v.optional(aiModelValidator),
  /** Path on the web app, for "Open on web". */
  webPath: v.string(),
});

export type MobileChat = typeof mobileChatValidator.type;

function repoLabel(repo: Doc<"githubRepos">): string {
  return repo.label ?? repo.name;
}

/**
 * Resolves a mobile chat target, or null when the id names nothing the app
 * can open. Access is the caller's job: `repoId` is returned for that check.
 */
export async function resolveMobileChat(
  db: GenericDatabaseReader<DataModel>,
  target: string,
): Promise<{ chat: MobileChat; repoId: Id<"githubRepos"> } | null> {
  const sessionChatId = db.normalizeId("sessionChats", target);
  const sessionId = db.normalizeId("sessions", target);
  if (sessionChatId || sessionId) {
    const chatId = sessionChatId ?? (sessionId ? (await findMainChat(db, sessionId))?._id : undefined);
    const context = chatId ? await loadSessionChat(db, chatId) : null;
    if (!context) return null;
    const { chat, session } = context;
    const repo = await db.get(session.repoId);
    if (!repo) return null;
    const base = `${getRepoHref(repo.owner, repo.name, repo.rootDirectory)}/sessions/${session.numId ?? ""}`;
    return {
      repoId: repo._id,
      chat: {
        kind: "session",
        title: chat.isMain ? session.title : `${session.title} · ${chat.title}`,
        repoLabel: repoLabel(repo),
        parentId: chat._id,
        replyChatId: chat.archived === true ? undefined : chat._id,
        model: chat.lastModel ?? session.lastModel,
        webPath: chat.isMain ? base : `${base}?chat=${chat.number}`,
      },
    };
  }

  const taskId = db.normalizeId("agentTasks", target);
  if (taskId) {
    const task = await db.get(taskId);
    const project = task?.projectId ? await db.get(task.projectId) : null;
    const repoId = task?.repoId ?? project?.repoId;
    const repo = repoId ? await db.get(repoId) : null;
    if (!task || !repo) return null;
    const base = getRepoHref(repo.owner, repo.name, repo.rootDirectory);
    return {
      repoId: repo._id,
      chat: {
        kind: "task",
        title: task.title,
        repoLabel: repoLabel(repo),
        parentId: task._id,
        webPath:
          project?.numId !== undefined
            ? `${base}/projects/${project.numId}/${task.numId ?? ""}/activity`
            : `${base}/quick-tasks/${task.numId ?? ""}`,
      },
    };
  }

  const projectId = db.normalizeId("projects", target);
  if (projectId) {
    const project = await db.get(projectId);
    const repo = project ? await db.get(project.repoId) : null;
    if (!project || !repo) return null;
    return {
      repoId: repo._id,
      chat: {
        kind: "project",
        title: project.title,
        repoLabel: repoLabel(repo),
        parentId: project._id,
        webPath: `${getRepoHref(repo.owner, repo.name, repo.rootDirectory)}/projects/${project.numId ?? ""}`,
      },
    };
  }
  return null;
}

/** One chat by target, for the chat screen. Null when missing or not allowed. */
export const getChat = authQuery({
  args: { target: v.string() },
  returns: v.union(mobileChatValidator, v.null()),
  handler: async (ctx, args) => {
    const resolved = await resolveMobileChat(ctx.db, args.target);
    if (!resolved) return null;
    if (!(await hasRepoAccess(ctx.db, resolved.repoId, ctx.userId))) return null;
    return resolved.chat;
  },
});

/** Recent open sessions across every repo the user can access, newest first. */
export const listChats = authQuery({
  args: {},
  returns: v.array(
    v.object({
      sessionId: v.id("sessions"),
      title: v.string(),
      repoLabel: v.string(),
      status: sessionStatusValidator,
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const repos = await gatherAccessibleRepos(ctx.db, ctx.userId, false);
    const perRepo = await Promise.all(
      repos.map(async (repo) => {
        // Open sessions store `archived` as undefined or false; read both.
        const groups = await Promise.all(
          [undefined, false].map((archived) =>
            ctx.db
              .query("sessions")
              .withIndex("by_repo_archived_and_deleted", (q) =>
                q.eq("repoId", repo._id).eq("archived", archived).eq("deletedAt", undefined),
              )
              .order("desc")
              .take(SESSIONS_PER_REPO),
          ),
        );
        return groups.flat().map((session) => ({
          sessionId: session._id,
          title: session.title,
          repoLabel: repoLabel(repo),
          status: session.status,
          updatedAt: session.updatedAt ?? session._creationTime,
        }));
      }),
    );
    return perRepo
      .flat()
      .toSorted((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, CHAT_LIST_LIMIT);
  },
});
