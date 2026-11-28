import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import {
  findMainChat,
  loadSessionChat,
  type SessionChatContext,
} from "../_sessionChats/helpers";
import { isSessionArchived } from "../_sessions/archive";
import { sessionOwnerEntityId, findWorkSession } from "../_sessions/owner";
import { chatSeedSettings } from "../_sessions/ownedSession";
import { findWorkChat } from "../_sessions/ownerState";
import { entityHref, repoBasePath } from "@eva/shared";
import { storedComposerTraits } from "../_shared/composerTraits";
import {
  aiModelValidator,
  chatEntityKindValidator,
  reasoningLevelValidator,
} from "../validators";

export const mobileChatValidator = v.object({
  kind: chatEntityKindValidator,
  title: v.string(),
  repoLabel: v.string(),
  repoId: v.id("githubRepos"),
  parentId: v.optional(v.id("sessionChats")),
  target: v.string(),
  canReply: v.boolean(),
  archived: v.optional(v.union(v.literal("task"), v.literal("project"))),
  model: v.optional(aiModelValidator),
  providerAccountId: v.optional(v.id("userProviderAccounts")),
  accountOwnerId: v.optional(v.id("users")),
  traits: v.object({
    effortLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
  }),
  sandboxActive: v.boolean(),
  sandboxBranch: v.optional(v.string()),
  intendedBranch: v.optional(v.string()),
  prUrl: v.optional(v.string()),
  webPath: v.string(),
  session: v.optional(
    v.object({ id: v.id("sessions"), chatId: v.id("sessionChats"), title: v.string(), archived: v.boolean() }),
  ),
  task: v.optional(
    v.object({
      id: v.id("agentTasks"),
      sessionChatId: v.optional(v.id("sessionChats")),
    }),
  ),
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

type ResolvedMobileChat = {
  chat: MobileChat;
  entity: MobileChatEntity;
  repoId: Id<"githubRepos">;
};

function onExactChat(
  owner: ResolvedMobileChat,
  context: SessionChatContext,
): ResolvedMobileChat {
  const { chat } = context;
  if (owner.entity.kind === "session" && owner.entity.context.chat._id === chat._id) {
    return owner;
  }
  return {
    ...owner,
    entity: { kind: "session", context },
    chat: {
      ...owner.chat,
      parentId: chat._id,
      target: chat._id,
      canReply: owner.chat.canReply,
      model: chat.lastModel ?? owner.chat.model,
      providerAccountId: chat.providerAccountId,
      traits: storedComposerTraits(chat),
    },
  };
}

/**
 * Resolves a mobile chat target, or null when the id names nothing the app
 * can open. Access is the caller's job: `repoId` is returned for that check.
 */
export async function resolveMobileChat(
  db: GenericDatabaseReader<DataModel>,
  target: string,
): Promise<ResolvedMobileChat | null> {
  const sessionChatId = db.normalizeId("sessionChats", target);
  const sessionId = db.normalizeId("sessions", target);
  if (sessionChatId || sessionId) {
    const chatId = sessionChatId ?? (sessionId ? (await findMainChat(db, sessionId))?._id : undefined);
    const context = chatId ? await loadSessionChat(db, chatId) : null;
    if (!context) return null;
    const { chat, session } = context;
    const ownerId = sessionOwnerEntityId(session);
    if (ownerId) {
      const owner = await resolveMobileChat(db, ownerId);
      return owner && onExactChat(owner, context);
    }
    const repo = await db.get(session.repoId);
    if (!repo) return null;
    const base = sessionWebPath(repo, session);
    const sandboxActive = session.status === "active";
    return {
      repoId: repo._id,
      entity: { kind: "session", context },
      chat: {
        kind: "session",
        title: session.title,
        repoLabel: repoLabel(repo),
        repoId: repo._id,
        parentId: chat._id,
        target: chat._id,
        canReply: !isSessionArchived(session) && session.deletedAt === undefined,
        model: chat.lastModel,
        providerAccountId: chat.providerAccountId,
        traits: storedComposerTraits(chat),
        sandboxActive,
        sandboxBranch: sandboxActive ? session.sandboxBranch : undefined,
        intendedBranch: session.branchName,
        prUrl: session.prUrl,
        webPath: base,
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
    const archived =
      task.archivedAt !== undefined
        ? "task"
        : project?.archivedAt !== undefined
          ? "project"
          : undefined;
    const base = repoBasePath(repo);
    const taskWebPath =
      project?.numId !== undefined
        ? `${base}/projects/${project.numId}/${task.numId ?? ""}/activity`
        : entityHref("task", repo, task.numId);
    const [owned, seed] = await Promise.all([
      findWorkChat(db, { kind: "task", task }),
      chatSeedSettings(db, { kind: "task", task }),
    ]);
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
          target: chat._id,
          canReply: archived === undefined,
          archived,
          model: chat.lastModel ?? seed.model,
          providerAccountId: chat.providerAccountId,
          accountOwnerId: task.createdBy,
          task: { id: task._id, sessionChatId: chat._id },
          traits: storedComposerTraits(chat),
          sandboxActive: ownedSandboxActive,
          sandboxBranch: ownedSandboxActive ? session.sandboxBranch : undefined,
          intendedBranch: session.branchName,
          prUrl: task.prUrl,
          webPath: taskWebPath,
        },
      };
    }
    const workSession = await findWorkSession(db, task);
    const workSandboxActive = workSession?.status === "active";
    return {
      repoId: repo._id,
      entity: { kind: "task", task },
      chat: {
        kind: "task",
        title: task.title,
        repoLabel: repoLabel(repo),
        repoId: repo._id,
        target: task._id,
        canReply: archived === undefined,
        archived,
        model: seed.model,
        providerAccountId: seed.providerAccountId,
        accountOwnerId: task.createdBy,
        task: { id: task._id },
        traits: seed.traits,
        sandboxActive: workSandboxActive,
        sandboxBranch: workSandboxActive ? workSession?.sandboxBranch : undefined,
        prUrl: task.prUrl,
        webPath: taskWebPath,
      },
    };
  }

  const projectId = db.normalizeId("projects", target);
  if (projectId) {
    const project = await db.get(projectId);
    const repo = project ? await db.get(project.repoId) : null;
    if (!project || !repo) return null;
    const [owned, seed] = await Promise.all([
      findWorkChat(db, { kind: "project", project }),
      chatSeedSettings(db, { kind: "project", project }),
    ]);
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
          target: chat._id,
          canReply: project.archivedAt === undefined,
          archived: project.archivedAt === undefined ? undefined : "project",
          model: chat.lastModel ?? seed.model,
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
    return {
      repoId: repo._id,
      entity: { kind: "project", project },
      chat: {
        kind: "project",
        title: project.title,
        repoLabel: repoLabel(repo),
        repoId: repo._id,
        target: project._id,
        canReply: project.archivedAt === undefined,
        archived: project.archivedAt === undefined ? undefined : "project",
        model: seed.model,
        providerAccountId: seed.providerAccountId,
        accountOwnerId: project.userId,
        project: { id: project._id },
        traits: seed.traits,
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
