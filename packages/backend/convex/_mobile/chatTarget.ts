import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import {
  findMainChat,
  loadSessionChat,
  type SessionChatContext,
} from "../_sessionChats/helpers";
import { getRepoHref } from "../notifications";
import { storedComposerTraits } from "../_shared/composerTraits";
import {
  aiModelValidator,
  chatEntityKindValidator,
  reasoningLevelValidator,
} from "../validators";

/**
 * Chat targets for the Eva mobile app (apps/mobile). The app opens every chat
 * by one string `target`: a session chat, session, quick task or project id,
 * the same id push notifications and `notifications.chatTarget` carry.
 *
 * Kept apart from `mobile.ts` so `pendingQuestions.ts` can resolve a target
 * without importing the chat workflows `mobile.ts` sends through.
 */

export const mobileChatValidator = v.object({
  kind: chatEntityKindValidator,
  title: v.string(),
  repoLabel: v.string(),
  /** The chat's repo, for starting a session from it (fork). */
  repoId: v.id("githubRepos"),
  /** The chat's id for `messages.listByParent`, `turns` and `pendingQuestions`. */
  parentId: v.union(v.id("sessionChats"), v.id("projects"), v.id("agentTasks")),
  /**
   * True when the app can reply: pass `parentId` as `target` to
   * `mobile.sendMessage` (and `mobile.stopTurn`). False for an archived
   * session or session chat (read-only, as the web) or a deleted task / project.
   */
  canReply: v.boolean(),
  /**
   * The chat's model, which a reply uses: as the web composer reads it (a
   * session or project chat's sticky `lastModel` / `lastChatModel`, a quick
   * task's `agentTasks.model` or the repo default).
   */
  model: v.optional(aiModelValidator),
  /** The chat's sticky provider account, which a reply runs on; absent is Team. */
  providerAccountId: v.optional(v.id("userProviderAccounts")),
  /**
   * The one user who may change the account (a task's or project's owner, as
   * the web picker); absent when anyone in the session may (a session chat).
   */
  accountOwnerId: v.optional(v.id("users")),
  /**
   * The chat's sticky traits in the web traits menu shape: absent fields fall
   * back to the model's defaults (`resolveTraitsForDisplay`). A reply uses them.
   */
  traits: v.object({
    effortLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
  }),
  /**
   * Whether the chat's sandbox runs, as the web reads it (a session's
   * `status`, a task's or project's review sandbox status is "active"). The
   * composer placeholder says a send wakes Eva up when it is false.
   */
  sandboxActive: v.boolean(),
  /**
   * The branch the sandbox worktree is on, only while the sandbox runs: the
   * web composer's read-only `SandboxBranchChip`.
   */
  sandboxBranch: v.optional(v.string()),
  /** The branch Eva booted the sandbox on, when the chat has one; a different `sandboxBranch` is hinted. */
  intendedBranch: v.optional(v.string()),
  /**
   * The chat's pull request, as the web Review pane reads it (a task in a
   * project uses the project's, as `taskPrUrl`). The phone diff screen passes
   * it to `github.getPrDiff`; absent before a PR is open.
   */
  prUrl: v.optional(v.string()),
  /** Path on the web app, for "Open on web" and message links. */
  webPath: v.string(),
  /**
   * Session chats only: the session the web session menu (rename, archive)
   * acts on, and the chat the web picker's `sessionChats` calls take.
   */
  session: v.optional(
    v.object({ id: v.id("sessions"), chatId: v.id("sessionChats"), title: v.string(), archived: v.boolean() }),
  ),
  /** Quick task chats only: the task the web task chat's model, traits and account calls take. */
  task: v.optional(v.object({ id: v.id("agentTasks") })),
  /** Project chats only: the project the web project chat's account calls take. */
  project: v.optional(v.object({ id: v.id("projects") })),
});

export type MobileChat = typeof mobileChatValidator.type;

/** The record behind a chat target, for the mobile mutations. */
export type MobileChatEntity =
  | { kind: "session"; context: SessionChatContext }
  | { kind: "task"; task: Doc<"agentTasks"> }
  | { kind: "project"; project: Doc<"projects"> };

export function repoLabel(repo: Doc<"githubRepos">): string {
  return repo.label ?? repo.name;
}

/** A session's page on the web app (its Main chat), as the web sidebar row links it. */
export function sessionWebPath(repo: Doc<"githubRepos">, session: Doc<"sessions">): string {
  return `${getRepoHref(repo.owner, repo.name, repo.rootDirectory)}/sessions/${session.numId ?? ""}`;
}

/**
 * Resolves a mobile chat target, or null when the id names nothing the app
 * can open. Access is the caller's job: `repoId` is returned for that check.
 */
export async function resolveMobileChat(
  db: GenericDatabaseReader<DataModel>,
  target: string,
): Promise<{
  chat: MobileChat;
  entity: MobileChatEntity;
  repoId: Id<"githubRepos">;
} | null> {
  const sessionChatId = db.normalizeId("sessionChats", target);
  const sessionId = db.normalizeId("sessions", target);
  if (sessionChatId || sessionId) {
    const chatId = sessionChatId ?? (sessionId ? (await findMainChat(db, sessionId))?._id : undefined);
    const context = chatId ? await loadSessionChat(db, chatId) : null;
    if (!context) return null;
    const { chat, session } = context;
    const repo = await db.get(session.repoId);
    if (!repo) return null;
    const base = sessionWebPath(repo, session);
    const sandboxActive = session.status === "active";
    return {
      repoId: repo._id,
      entity: { kind: "session", context },
      chat: {
        kind: "session",
        title: chat.isMain ? session.title : `${session.title} · ${chat.title}`,
        repoLabel: repoLabel(repo),
        repoId: repo._id,
        parentId: chat._id,
        canReply: chat.archived !== true && session.archived !== true && session.deletedAt === undefined,
        model: chat.lastModel ?? session.lastModel,
        providerAccountId: chat.providerAccountId,
        traits: storedComposerTraits(chat),
        sandboxActive,
        sandboxBranch: sandboxActive ? session.sandboxBranch : undefined,
        intendedBranch: session.branchName,
        prUrl: session.prUrl,
        webPath: chat.isMain ? base : `${base}?chat=${chat.number}`,
        session: { id: session._id, chatId: chat._id, title: session.title, archived: session.archived === true },
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
    const sandboxActive = task.reviewTaskSandboxStatus === "active";
    return {
      repoId: repo._id,
      entity: { kind: "task", task },
      chat: {
        kind: "task",
        title: task.title,
        repoLabel: repoLabel(repo),
        repoId: repo._id,
        parentId: task._id,
        canReply: task.deletedAt === undefined,
        // The web task chat picks and sends `agentTasks.model`, not the `lastChatModel` a turn records.
        model: task.model ?? repo.defaultModel,
        providerAccountId: task.providerAccountId,
        accountOwnerId: task.createdBy,
        task: { id: task._id },
        traits: storedComposerTraits(task),
        sandboxActive,
        sandboxBranch: sandboxActive ? task.sandboxBranch : undefined,
        prUrl: task.projectId === undefined ? task.prUrl : project?.prUrl,
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
    const sandboxActive = project.reviewProjectSandboxStatus === "active";
    return {
      repoId: repo._id,
      entity: { kind: "project", project },
      chat: {
        kind: "project",
        title: project.title,
        repoLabel: repoLabel(repo),
        repoId: repo._id,
        parentId: project._id,
        canReply: project.deletedAt === undefined,
        model: project.lastChatModel ?? project.model,
        providerAccountId: project.providerAccountId,
        accountOwnerId: project.userId,
        project: { id: project._id },
        traits: storedComposerTraits(project),
        sandboxActive,
        sandboxBranch: sandboxActive ? project.sandboxBranch : undefined,
        intendedBranch: project.branchName,
        prUrl: project.prUrl,
        webPath: `${getRepoHref(repo.owner, repo.name, repo.rootDirectory)}/projects/${project.numId ?? ""}`,
      },
    };
  }
  return null;
}
