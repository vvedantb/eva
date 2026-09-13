import { v } from "convex/values";
import {
  authQuery,
  hasRepoAccess,
  hasTaskAccess,
  sessionVisibleToUser,
} from "../functions";
import { entityVisible } from "../numId";
import {
  DATA_MENTION_BADGE,
  DATA_MENTION_KINDS,
  type DataMentionKind,
} from "./dataKinds";

const dataMentionKindValidator = v.union(
  v.literal("document"),
  v.literal("session"),
  v.literal("project"),
  v.literal("quickTask"),
);

const dataMentionItemValidator = v.object({
  kind: dataMentionKindValidator,
  id: v.string(),
  label: v.string(),
  badge: v.string(),
  description: v.optional(v.string()),
  /** Full doc body — only set for document entities in getEntity. */
  content: v.optional(v.string()),
  numId: v.optional(v.number()),
});

type DataMentionItem = {
  kind: DataMentionKind;
  id: string;
  label: string;
  badge: string;
  description?: string;
  content?: string;
  numId?: number;
};

function previewOneLine(text: string, maxLength = 72): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1)}…`;
}

function docDescriptionPreview(doc: {
  description?: string;
  content: string;
}): string | undefined {
  const description = doc.description?.trim();
  if (description) return previewOneLine(description);
  const content = doc.content.trim();
  return content ? previewOneLine(content) : undefined;
}

/**
 * Lists Data `@` mention candidates for a repo: documents, sessions, projects,
 * and quick tasks (agentTasks). Lightweight fields only for the picker.
 *
 * Caps each source at 200 most-recent rows so a large repo cannot stream every
 * historical doc/session (full `docs.content` bodies especially) into every
 * composer subscription.
 */
export const listData = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(dataMentionItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];

    const items: DataMentionItem[] = [];
    const MENTION_LIST_CAP = 200;

    const docs = await ctx.db
      .query("docs")
      .withIndex("by_repo_and_deleted", (q) =>
        q.eq("repoId", args.repoId).eq("deletedAt", undefined),
      )
      .order("desc")
      .take(MENTION_LIST_CAP);
    for (const doc of docs) {
      // Prefer stored description — avoid pulling the whole body into the
      // picker payload even though the document read already paid for it.
      const description = doc.description?.trim()
        ? previewOneLine(doc.description)
        : undefined;
      items.push({
        kind: "document",
        id: doc._id,
        label: doc.title,
        badge: DATA_MENTION_BADGE.document,
        ...(description !== undefined ? { description } : {}),
        ...(doc.numId !== undefined ? { numId: doc.numId } : {}),
      });
    }

    // Include archived sessions — soft-deleted only are excluded below.
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_repo_and_deleted", (q) =>
        q.eq("repoId", args.repoId).eq("deletedAt", undefined),
      )
      .order("desc")
      .take(MENTION_LIST_CAP);
    for (const session of sessions) {
      if (!sessionVisibleToUser(session, ctx.userId)) continue;
      items.push({
        kind: "session",
        id: session._id,
        label: session.title,
        badge: DATA_MENTION_BADGE.session,
        ...(session.numId !== undefined ? { numId: session.numId } : {}),
      });
    }

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_repo_and_deleted", (q) =>
        q.eq("repoId", args.repoId).eq("deletedAt", undefined),
      )
      .order("desc")
      .take(MENTION_LIST_CAP);
    for (const project of projects) {
      const description = project.description?.trim();
      items.push({
        kind: "project",
        id: project._id,
        label: project.title,
        badge: DATA_MENTION_BADGE.project,
        ...(description ? { description: previewOneLine(description) } : {}),
        ...(project.numId !== undefined ? { numId: project.numId } : {}),
      });
    }

    // Open work only — done tasks rarely need @-mention and dominate large repos.
    const taskStatuses: Array<
      "todo" | "in_progress" | "code_review" | "business_review"
    > = ["todo", "in_progress", "code_review", "business_review"];
    const taskArrays = await Promise.all(
      taskStatuses.map((status) =>
        ctx.db
          .query("agentTasks")
          .withIndex("by_repo_status_and_deleted", (q) =>
            q
              .eq("repoId", args.repoId)
              .eq("status", status)
              .eq("deletedAt", undefined),
          )
          .take(MENTION_LIST_CAP),
      ),
    );
    for (const task of taskArrays.flat()) {
      const description = task.description?.trim();
      items.push({
        kind: "quickTask",
        id: task._id,
        label: task.title,
        badge: DATA_MENTION_BADGE.quickTask,
        ...(description ? { description: previewOneLine(description) } : {}),
        ...(task.numId !== undefined ? { numId: task.numId } : {}),
      });
    }

    return items.sort((a, b) => a.label.localeCompare(b.label));
  },
});

/**
 * Resolves a stored mention id to its kind + navigation fields. Used by chips
 * that only have the opaque Convex id from `@[Label](id)`.
 */
export const getEntity = authQuery({
  args: { id: v.string(), repoId: v.id("githubRepos") },
  returns: v.union(dataMentionItemValidator, v.null()),
  handler: async (ctx, args): Promise<DataMentionItem | null> => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return null;

    const docId = ctx.db.normalizeId("docs", args.id);
    if (docId) {
      const doc = await ctx.db.get(docId);
      const visible = entityVisible(doc);
      if (visible && visible.repoId === args.repoId) {
        const description = docDescriptionPreview(visible);
        const item: DataMentionItem = {
          kind: "document",
          id: visible._id,
          label: visible.title,
          badge: DATA_MENTION_BADGE.document,
          ...(description !== undefined ? { description } : {}),
          ...(visible.numId !== undefined ? { numId: visible.numId } : {}),
        };
        return item;
      }
    }

    const sessionId = ctx.db.normalizeId("sessions", args.id);
    if (sessionId) {
      const session = await ctx.db.get(sessionId);
      const visible = entityVisible(session);
      if (
        visible &&
        visible.repoId === args.repoId &&
        sessionVisibleToUser(visible, ctx.userId)
      ) {
        const item: DataMentionItem = {
          kind: "session",
          id: visible._id,
          label: visible.title,
          badge: DATA_MENTION_BADGE.session,
          ...(visible.numId !== undefined ? { numId: visible.numId } : {}),
        };
        return item;
      }
    }

    const projectId = ctx.db.normalizeId("projects", args.id);
    if (projectId) {
      const project = await ctx.db.get(projectId);
      const visible = entityVisible(project);
      if (visible && visible.repoId === args.repoId) {
        const description = visible.description?.trim();
        const item: DataMentionItem = {
          kind: "project",
          id: visible._id,
          label: visible.title,
          badge: DATA_MENTION_BADGE.project,
          ...(description ? { description: previewOneLine(description) } : {}),
          ...(visible.numId !== undefined ? { numId: visible.numId } : {}),
        };
        return item;
      }
    }

    const taskId = ctx.db.normalizeId("agentTasks", args.id);
    if (taskId) {
      const task = await ctx.db.get(taskId);
      const visible = entityVisible(task);
      if (
        visible &&
        visible.repoId === args.repoId &&
        (await hasTaskAccess(ctx.db, visible, ctx.userId))
      ) {
        const description = visible.description?.trim();
        const item: DataMentionItem = {
          kind: "quickTask",
          id: visible._id,
          label: visible.title,
          badge: DATA_MENTION_BADGE.quickTask,
          ...(description ? { description: previewOneLine(description) } : {}),
          ...(visible.numId !== undefined ? { numId: visible.numId } : {}),
        };
        return item;
      }
    }

    return null;
  },
});

export type { DataMentionKind };
export { DATA_MENTION_KINDS, DATA_MENTION_BADGE };
