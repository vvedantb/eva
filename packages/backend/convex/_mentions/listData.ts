import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { authQuery, hasRepoAccess, isTaskVisibleTo } from "../functions";
import { archivedProjectIds, entityVisible, filterLiveTasks } from "../numId";
import { standaloneOnly } from "../_sessions/owner";
import { findRepoByPath } from "../_githubRepos/helpers";
import { OPEN_TASK_STATUSES } from "../validators";
import { getUserDisplayName } from "@eva/shared/taskDetail";
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
  /** Hover card only (getEntity): last change and who created it. */
  updatedAt: v.optional(v.number()),
  authorName: v.optional(v.string()),
});

type DataMentionItem = {
  kind: DataMentionKind;
  id: string;
  label: string;
  badge: string;
  description?: string;
  content?: string;
  numId?: number;
  updatedAt?: number;
  authorName?: string;
};

/** Name and last change for the hover card, shared by every non-doc kind. */
async function cardMeta(
  db: QueryCtx["db"],
  row: { _creationTime: number; updatedAt?: number },
  authorId: Id<"users"> | undefined,
): Promise<{ updatedAt: number; authorName?: string }> {
  const author = authorId === undefined ? null : await db.get(authorId);
  return {
    updatedAt: row.updatedAt ?? row._creationTime,
    ...(author !== null ? { authorName: getUserDisplayName(author) } : {}),
  };
}

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

    // Include archived sessions — soft-deleted only are excluded below. A
    // task's session is not mentionable: mention the task.
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_repo_and_deleted", (q) =>
        q.eq("repoId", args.repoId).eq("deletedAt", undefined),
      )
      .filter(standaloneOnly)
      .order("desc")
      .take(MENTION_LIST_CAP);
    for (const session of sessions) {
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
      .withIndex("by_repo_and_archived", (q) =>
        q.eq("repoId", args.repoId).eq("archivedAt", undefined),
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
    const [archivedProjects, ...taskArrays] = await Promise.all([
      archivedProjectIds(ctx.db, args.repoId),
      ...OPEN_TASK_STATUSES.map((status) =>
        ctx.db
          .query("agentTasks")
          .withIndex("by_repo_status_and_archived", (q) =>
            q
              .eq("repoId", args.repoId)
              .eq("status", status)
              .eq("archivedAt", undefined),
          )
          .take(MENTION_LIST_CAP),
      ),
    ]);
    for (const task of filterLiveTasks(taskArrays.flat(), archivedProjects)) {
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
          content: visible.content,
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
      if (visible && visible.repoId === args.repoId) {
        const item: DataMentionItem = {
          kind: "session",
          id: visible._id,
          label: visible.title,
          badge: DATA_MENTION_BADGE.session,
          ...(visible.numId !== undefined ? { numId: visible.numId } : {}),
          ...(await cardMeta(
            ctx.db,
            visible,
            visible.createdBy ?? visible.userId,
          )),
        };
        return item;
      }
    }

    const projectId = ctx.db.normalizeId("projects", args.id);
    if (projectId) {
      // An archived project still resolves: its chip opens it read-only.
      const visible = await ctx.db.get(projectId);
      if (visible && visible.repoId === args.repoId) {
        const description = visible.description?.trim();
        const item: DataMentionItem = {
          kind: "project",
          id: visible._id,
          label: visible.title,
          badge: DATA_MENTION_BADGE.project,
          ...(description ? { description: previewOneLine(description) } : {}),
          ...(visible.numId !== undefined ? { numId: visible.numId } : {}),
          ...(await cardMeta(ctx.db, visible, visible.userId)),
        };
        return item;
      }
    }

    const taskId = ctx.db.normalizeId("agentTasks", args.id);
    if (taskId) {
      // An archived task still resolves: its chip opens it read-only.
      const visible = await ctx.db.get(taskId);
      if (
        visible &&
        visible.repoId === args.repoId &&
        isTaskVisibleTo(visible, ctx.userId)
      ) {
        const description = visible.description?.trim();
        const item: DataMentionItem = {
          kind: "quickTask",
          id: visible._id,
          label: visible.title,
          badge: DATA_MENTION_BADGE.quickTask,
          ...(description ? { description: previewOneLine(description) } : {}),
          ...(visible.numId !== undefined ? { numId: visible.numId } : {}),
          ...(await cardMeta(ctx.db, visible, visible.createdBy)),
        };
        return item;
      }
    }

    return null;
  },
});

type EntitySection = "sessions" | "quick-tasks" | "projects" | "docs";

/** The row a section's `<numId>` names inside one repo. */
function findByNumId(
  db: QueryCtx["db"],
  section: EntitySection,
  repoId: Id<"githubRepos">,
  numId: number,
) {
  switch (section) {
    case "sessions":
      return db
        .query("sessions")
        .withIndex("by_repo_and_numId", (q) =>
          q.eq("repoId", repoId).eq("numId", numId),
        )
        .first();
    case "quick-tasks":
      return db
        .query("agentTasks")
        .withIndex("by_repo_and_numId", (q) =>
          q.eq("repoId", repoId).eq("numId", numId),
        )
        .first();
    case "projects":
      return db
        .query("projects")
        .withIndex("by_repo_and_numId", (q) =>
          q.eq("repoId", repoId).eq("numId", numId),
        )
        .first();
    case "docs":
      return db
        .query("docs")
        .withIndex("by_repo_and_numId", (q) =>
          q.eq("repoId", repoId).eq("numId", numId),
        )
        .first();
  }
}

/**
 * Resolves an Eva link (`/owner/name[/app]/<section>/<numId>`) to the repo and
 * entity id the mention hover card reads. Null when the repo or entity does not
 * exist or the caller cannot read the repo; `getEntity` applies the per-entity
 * visibility rules after this.
 */
export const getEntityByPath = authQuery({
  args: {
    owner: v.string(),
    name: v.string(),
    appName: v.optional(v.string()),
    section: v.union(
      v.literal("sessions"),
      v.literal("quick-tasks"),
      v.literal("projects"),
      v.literal("docs"),
    ),
    numId: v.number(),
  },
  returns: v.union(
    v.object({ repoId: v.id("githubRepos"), entityId: v.string() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const repo = await findRepoByPath(ctx.db, args);
    if (!repo || !(await hasRepoAccess(ctx.db, repo._id, ctx.userId))) {
      return null;
    }
    const row = await findByNumId(ctx.db, args.section, repo._id, args.numId);
    return row ? { repoId: repo._id, entityId: row._id } : null;
  },
});

export type { DataMentionKind };
export { DATA_MENTION_KINDS, DATA_MENTION_BADGE };
