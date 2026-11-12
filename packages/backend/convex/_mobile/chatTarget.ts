import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import {
  findMainChat,
  loadSessionChat,
  type SessionChatContext,
} from "../_sessionChats/helpers";
import { isSessionArchived } from "../_sessions/archive";
import { chatOwnerEntityId, findTaskWorkSession } from "../_sessions/owner";
import { findOwnerChat, type OwnerEntity } from "../_sessions/ownedSession";
import { entityHref, repoBasePath } from "@eva/shared";
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
  /**
   * Quick task chats only: the task. `sessionChatId` is set once the task
   * chats in its session's Main chat (`parentId` is then that chat): model and
   * traits picks go through `mobile.setChatModel`, not `agentTasks.update`.
   */
  task: v.optional(
    v.object({
      id: v.id("agentTasks"),
      sessionChatId: v.optional(v.id("sessionChats")),
    }),
  ),
  /**
   * Project chats only: the project. `sessionChatId` is set once the project
   * chats in its session's Main chat (`parentId` is then that chat).
   */
  project: v.optional(
    v.object({
      id: v.id("projects"),
      sessionChatId: v.optional(v.id("sessionChats")),
    }),
  ),
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
  return entityHref("session", repo, session.numId);
}

/**
 * The session chat a task or project talks in (`findOwnerChat`), or null
 * before it has one.
 */
async function resolveOwnerSessionChat(
  db: GenericDatabaseReader<DataModel>,
  entity: OwnerEntity,
): Promise<SessionChatContext | null> {
  return await findOwnerChat(db, entity);
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
    // A task's or project's session chat is that owner's chat (`parentId`
    // round-trips here); a project task's chat is the task's.
    const ownerId = chatOwnerEntityId(chat, session);
    if (ownerId) return await resolveMobileChat(db, ownerId);
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
        canReply: chat.archived !== true && !isSessionArchived(session) && session.deletedAt === undefined,
        model: chat.lastModel ?? session.lastModel,
        providerAccountId: chat.providerAccountId,
        traits: storedComposerTraits(chat),
        sandboxActive,
        sandboxBranch: sandboxActive ? session.sandboxBranch : undefined,
        intendedBranch: session.branchName,
        prUrl: session.prUrl,
        webPath: chat.isMain ? base : `${base}?chat=${chat.number}`,
        session: { id: session._id, chatId: chat._id, title: session.title, archived: isSessionArchived(session) },
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
    const base = repoBasePath(repo);
    const taskWebPath =
      project?.numId !== undefined
        ? `${base}/projects/${project.numId}/${task.numId ?? ""}/activity`
        : entityHref("task", repo, task.numId);
    // A task chats in its session chat (a quick task's Main chat, a project
    // task's own chat in the project's session). Shown as the task (title,
    // link, PR); read, sent and stopped as that session chat. A task with no
    // session chat yet resolves as below until its first send creates one.
    const owned = await resolveOwnerSessionChat(db, { kind: "task", task });
    if (owned) {
      const { chat, session } = owned;
      const ownedSandboxActive = session.status === "active";
      return {
        repoId: repo._id,
        entity: { kind: "session", context: owned },
        chat: {
          kind: "task",
          title: task.title,
          repoLabel: repoLabel(repo),
          repoId: repo._id,
          parentId: chat._id,
          canReply: task.deletedAt === undefined && chat.archived !== true,
          model: chat.lastModel ?? session.lastModel,
          providerAccountId: chat.providerAccountId,
          accountOwnerId: task.createdBy,
          task: { id: task._id, sessionChatId: chat._id },
          traits: storedComposerTraits(chat),
          sandboxActive: ownedSandboxActive,
          sandboxBranch: ownedSandboxActive ? session.sandboxBranch : undefined,
          intendedBranch: session.branchName,
          prUrl: task.projectId === undefined ? task.prUrl : project?.prUrl,
          webPath: taskWebPath,
        },
      };
    }
    // No chat yet: the first send creates it (`ensureOwnerChat`). Nothing
    // hangs off the task id. A project task may already work on its
    // project's running session.
    const workSession = await findTaskWorkSession(db, task);
    const workSandboxActive = workSession?.status === "active";
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
        traits: storedComposerTraits({}),
        sandboxActive: workSandboxActive,
        sandboxBranch: workSandboxActive ? workSession?.sandboxBranch : undefined,
        prUrl: task.projectId === undefined ? task.prUrl : project?.prUrl,
        webPath: taskWebPath,
      },
    };
  }

  const projectId = db.normalizeId("projects", target);
  if (projectId) {
    const project = await db.get(projectId);
    const repo = project ? await db.get(project.repoId) : null;
    if (!project || !repo) return null;
    // A project chats in its session's Main chat: shown as the project, read,
    // sent and stopped as that session chat.
    const owned = await resolveOwnerSessionChat(db, {
      kind: "project",
      project,
    });
    if (owned) {
      const { chat, session } = owned;
      const ownedSandboxActive = session.status === "active";
      return {
        repoId: repo._id,
        entity: { kind: "session", context: owned },
        chat: {
          kind: "project",
          title: project.title,
          repoLabel: repoLabel(repo),
          repoId: repo._id,
          parentId: chat._id,
          canReply: project.deletedAt === undefined && chat.archived !== true,
          model: chat.lastModel ?? session.lastModel,
          providerAccountId: chat.providerAccountId,
          accountOwnerId: project.userId,
          project: { id: project._id, sessionChatId: chat._id },
          traits: storedComposerTraits(chat),
          sandboxActive: ownedSandboxActive,
          sandboxBranch: ownedSandboxActive ? session.sandboxBranch : undefined,
          intendedBranch: session.branchName,
          prUrl: project.prUrl,
          webPath: entityHref("project", repo, project.numId),
        },
      };
    }
    // No session chat yet: the first send creates it (`ensureOwnerChat`).
    // Nothing hangs off the project id, and there is no sandbox.
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
        model: project.model ?? repo.defaultModel,
        providerAccountId: project.providerAccountId,
        accountOwnerId: project.userId,
        project: { id: project._id },
        traits: storedComposerTraits({}),
        sandboxActive: false,
        sandboxBranch: undefined,
        intendedBranch: project.branchName,
        prUrl: project.prUrl,
        webPath: entityHref("project", repo, project.numId),
      },
    };
  }
  return null;
}
