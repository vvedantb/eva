import { v } from "convex/values";
import { Data, Effect } from "effect";
import type { Doc, Id } from "./_generated/dataModel";
import {
  authAction,
  authQuery,
  authMutation,
  hasRepoAccess,
} from "./functions";
import { allocateNumId, entityVisible, isEntityDeleted } from "./numId";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import { extractPrNumberFromUrl } from "./_projects/prSync";
import {
  aiModelValidator,
  DEFAULT_AI_MODEL,
  modelTraitsExecutionFields,
  normalizeAIModel,
  prRecapOriginValidator,
  prRecapStatusValidator,
  roleValidator,
  docKindValidator,
  docFields,
  evaluationStatusValidator,
} from "./validators";
import { resolvePrRecapWrite } from "./_prRecapWorkflow/recapState";
import { prosemirrorSync } from "./prosemirrorSync";
import { markdownToDocJson } from "./_docEditor/markdown";
import { workflow } from "./workflowManager";
import { trackDocWorkflow } from "./workflowWatchdog";
import {
  findAllSiblingRepoIds,
  findSiblingRepos,
  hasCodebaseRepoAccess,
  resolveCodebaseDocsRepoId,
} from "./_githubRepos/helpers";
import { isEvaOwnedPullRequest } from "./_github/evaPrOwnership";
import { runActionEffect } from "./_effect/action";

const docValidator = v.object({
  _id: v.id("docs"),
  _creationTime: v.number(),
  ...docFields,
});

/** Soft-limit matching sidebar hover preview — avoid shipping full bodies on list. */
const DOC_LIST_PREVIEW_MAX = 280;

/**
 * Sidebar / picker list shape. Full `content`, `html`, and interview history are
 * loaded via `docs.get` on the detail page.
 */
const docListItemValidator = v.object({
  _id: v.id("docs"),
  _creationTime: v.number(),
  numId: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
  repoId: v.id("githubRepos"),
  kind: v.optional(docKindValidator),
  sessionId: v.optional(v.id("sessions")),
  title: v.string(),
  /** Truncated description-or-content for sidebar hover cards. */
  contentPreview: v.union(v.string(), v.null()),
  /** True when `content.trim()` is non-empty (Testing Arena "test all"). */
  hasContent: v.boolean(),
  prUrl: v.optional(v.string()),
  prNumber: v.optional(v.number()),
  headSha: v.optional(v.string()),
  prRecapStatus: v.optional(prRecapStatusValidator),
  prRecapOrigin: v.optional(prRecapOriginValidator),
  prRecapError: v.optional(v.string()),
  description: v.optional(v.string()),
  testGenStatus: v.optional(evaluationStatusValidator),
  testPrUrl: v.optional(v.string()),
  createdBy: v.optional(v.id("users")),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function docListPreview(doc: {
  description?: string;
  content: string;
}): string | null {
  const source = doc.description?.trim() ? doc.description : doc.content;
  const cleaned = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length <= DOC_LIST_PREVIEW_MAX) return cleaned;
  return `${cleaned.slice(0, DOC_LIST_PREVIEW_MAX - 1)}…`;
}

function toDocListItem(doc: Doc<"docs">) {
  return {
    _id: doc._id,
    _creationTime: doc._creationTime,
    numId: doc.numId,
    deletedAt: doc.deletedAt,
    repoId: doc.repoId,
    kind: doc.kind,
    sessionId: doc.sessionId,
    title: doc.title,
    contentPreview: docListPreview(doc),
    hasContent: doc.content.trim().length > 0,
    prUrl: doc.prUrl,
    prNumber: doc.prNumber,
    headSha: doc.headSha,
    prRecapStatus: doc.prRecapStatus,
    prRecapOrigin: doc.prRecapOrigin,
    prRecapError: doc.prRecapError,
    description: doc.description,
    testGenStatus: doc.testGenStatus,
    testPrUrl: doc.testPrUrl,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Lists all docs for a given repo, filtered by user access. PR recaps are shared across monorepo apps. */
export const list = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    kind: v.optional(docKindValidator),
    /** When true, hide Eva-origin sandbox PR recaps from the Documents sidebar. */
    excludeEvaRecaps: v.optional(v.boolean()),
  },
  returns: v.array(docListItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];

    const siblingIds = await findAllSiblingRepoIds(ctx.db, args.repoId);
    const seen = new Set<string>();
    const docs: Doc<"docs">[] = [];

    for (const siblingId of siblingIds) {
      const siblingDocs = await ctx.db
        .query("docs")
        .withIndex("by_repo", (q) => q.eq("repoId", siblingId))
        .collect();

      for (const doc of siblingDocs) {
        if (seen.has(doc._id)) continue;
        if (args.kind !== undefined && doc.kind !== args.kind) continue;
        const isCurrentRepo = siblingId === args.repoId;
        const isSharedRecap = doc.kind === "pr-recap";
        if (!isCurrentRepo && !isSharedRecap) continue;
        if (
          args.excludeEvaRecaps === true &&
          doc.kind === "pr-recap" &&
          doc.prRecapOrigin === "eva"
        ) {
          continue;
        }
        if (isEntityDeleted(doc)) continue;
        seen.add(doc._id);
        docs.push(doc);
      }
    }

    // PR recaps: newest PRs first. Other docs: most recently created first.
    return docs
      .toSorted((a, b) => {
        if (a.kind === "pr-recap" && b.kind === "pr-recap") {
          const byPr = (b.prNumber ?? 0) - (a.prNumber ?? 0);
          if (byPr !== 0) return byPr;
        }
        return b._creationTime - a._creationTime;
      })
      .map(toDocListItem);
  },
});

/** Returns the per-repo numId used in Eva doc URLs (/docs/$numId/…). */
export const getPathNumId = internalQuery({
  args: { docId: v.id("docs") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc || doc.numId === undefined) {
      throw new Error("Document numId not found");
    }
    return doc.numId;
  },
});

/** Fetches a PR recap doc by pull request URL. */
export const getRecapByPrUrl = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    prUrl: v.string(),
  },
  returns: v.union(docValidator, v.null()),
  handler: async (ctx, args) => {
    if (!(await hasCodebaseRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return null;
    }
    const docsRepoId = await resolveCodebaseDocsRepoId(ctx.db, args.repoId);
    const doc = await ctx.db
      .query("docs")
      .withIndex("by_repo_and_pr_url", (q) =>
        q.eq("repoId", docsRepoId).eq("prUrl", args.prUrl),
      )
      .first();
    if (!doc || doc.kind !== "pr-recap") return null;
    return entityVisible(doc);
  },
});

/** Fetches a single doc by ID, with access control. PR recaps allow any sibling app repo access. */
export const get = authQuery({
  args: { id: v.id("docs") },
  returns: v.union(docValidator, v.null()),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) return null;

    if (doc.kind === "pr-recap") {
      if (!(await hasCodebaseRepoAccess(ctx.db, doc.repoId, ctx.userId))) {
        return null;
      }
      return entityVisible(doc);
    }

    if (!(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId))) return null;
    return entityVisible(doc);
  },
});

/**
 * Resolves a doc by per-repo numeric id (URL segment). PR-recap docs live on the
 * codebase's root/docs sibling repo but appear in every sibling app's sidebar, so
 * when the numId is not found on the current repo we look across siblings for a
 * shared recap with that numId (mirroring the `list` sharing rule).
 */
export const getByNumId = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    numId: v.number(),
  },
  returns: v.union(docValidator, v.null()),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return null;

    const own = await ctx.db
      .query("docs")
      .withIndex("by_repo_and_numId", (q) =>
        q.eq("repoId", args.repoId).eq("numId", args.numId),
      )
      .first();
    const visibleOwn = entityVisible(own);
    if (visibleOwn) return visibleOwn;

    const siblingIds = await findAllSiblingRepoIds(ctx.db, args.repoId);
    for (const siblingId of siblingIds) {
      if (siblingId === args.repoId) continue;
      const doc = await ctx.db
        .query("docs")
        .withIndex("by_repo_and_numId", (q) =>
          q.eq("repoId", siblingId).eq("numId", args.numId),
        )
        .first();
      if (doc && doc.kind === "pr-recap") {
        return entityVisible(doc);
      }
    }

    return null;
  },
});

/** Creates a new doc in a repo. */
export const create = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    title: v.string(),
    content: v.string(),
  },
  returns: v.id("docs"),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const now = Date.now();
    const numId = await allocateNumId(ctx.db, args.repoId, "docs");
    const docId = await ctx.db.insert("docs", {
      repoId: args.repoId,
      title: args.title,
      content: args.content,
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
      numId,
    });

    await prosemirrorSync.create(ctx, docId, markdownToDocJson(args.content));

    return docId;
  },
});

/** Updates a doc's title or description. Content is now managed via live sync. */
export const update = authMutation({
  args: {
    id: v.id("docs"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Doc not found");
    }
    const updates: {
      title?: string;
      content?: string;
      description?: string;
      updatedAt: number;
    } = {
      updatedAt: Date.now(),
    };
    if (args.title !== undefined) updates.title = args.title;
    if (args.content !== undefined) updates.content = args.content;
    if (args.description !== undefined) updates.description = args.description;
    await ctx.db.patch(args.id, updates);
    return null;
  },
});

/** Returns the doc associated with a session, if any. Used by PRD tab to determine Save vs Update label. */
export const getBySession = authQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.union(docValidator, v.null()),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) return null;
    return await ctx.db
      .query("docs")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
  },
});

/** Saves a session's plan content as a doc. If a doc already exists for this session, updates its content. */
export const createFromSession = authMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.id("docs"),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const planContent = session.planContent?.trim();
    if (!planContent) {
      throw new Error("Session has no plan content to save");
    }
    const existing = await ctx.db
      .query("docs")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    const now = Date.now();
    const planJson = markdownToDocJson(session.planContent ?? "");

    if (existing) {
      // "Update Document": overwrite the live synced doc with the latest plan.
      // We reset the sync component's data and recreate it (rather than a
      // server-side transform, which would need the full editor schema in the
      // isolate). This is an explicit, infrequent overwrite, so clobbering any
      // in-flight collaborative edits on this doc is acceptable.
      const snapshot = await ctx.runQuery(
        components.prosemirrorSync.lib.getSnapshot,
        { id: existing._id },
      );
      if (snapshot.content !== null) {
        await ctx.runMutation(components.prosemirrorSync.lib.deleteDocument, {
          id: existing._id,
        });
      }
      await prosemirrorSync.create(ctx, existing._id, planJson);
      await ctx.db.patch(existing._id, {
        content: session.planContent ?? "",
        contentUpdatedAt: now,
        updatedAt: now,
      });
      return existing._id;
    }

    const docId = await ctx.db.insert("docs", {
      repoId: session.repoId,
      sessionId: args.sessionId,
      title: session.title,
      content: session.planContent ?? "",
      contentUpdatedAt: now,
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
      numId: await allocateNumId(ctx.db, session.repoId, "docs"),
    });
    await prosemirrorSync.create(ctx, docId, planJson);
    return docId;
  },
});

/** Ensures a sync document exists for a legacy doc (lazy migration). */
export const ensureSyncDoc = authMutation({
  args: { id: v.id("docs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Doc not found");
    if (!(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    const existing = await ctx.runQuery(
      components.prosemirrorSync.lib.getSnapshot,
      { id: args.id },
    );
    if (existing.content !== null) return null;

    await prosemirrorSync.create(ctx, args.id, markdownToDocJson(doc.content));
    return null;
  },
});

/** Deletes a doc (soft-delete — row is retained). */
export const remove = authMutation({
  args: { id: v.id("docs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Doc not found");
    }
    if (!(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    await ctx.db.patch(args.id, { deletedAt: Date.now() });
    return null;
  },
});

/** Appends a message to the doc's interview conversation history. */
export const addInterviewMessage = authMutation({
  args: {
    id: v.id("docs"),
    role: roleValidator,
    content: v.string(),
    activityLog: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Doc not found");
    const history = doc.interviewHistory ?? [];
    history.push({
      role: args.role,
      content: args.content,
      activityLog: args.activityLog,
      userId: ctx.userId,
    });
    await ctx.db.patch(args.id, { interviewHistory: history });
    return null;
  },
});

/** Clears a doc's interview history and associated sandbox. */
export const clearInterview = authMutation({
  args: { id: v.id("docs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Doc not found");
    await ctx.db.patch(args.id, {
      interviewHistory: undefined,
      sandboxId: undefined,
    });
    return null;
  },
});

/** Looks up a PR recap doc by stable GitHub PR URL within a codebase. */
export const getByPrUrl = internalQuery({
  args: {
    repoId: v.id("githubRepos"),
    prUrl: v.string(),
  },
  returns: v.union(docValidator, v.null()),
  handler: async (ctx, args) => {
    const docsRepoId = await resolveCodebaseDocsRepoId(ctx.db, args.repoId);
    return await ctx.db
      .query("docs")
      .withIndex("by_repo_and_pr_url", (q) =>
        q.eq("repoId", docsRepoId).eq("prUrl", args.prUrl),
      )
      .first();
  },
});

/** Creates or updates a system-owned PR recap doc and resets its ProseMirror content. */
async function upsertPrRecapDocImpl(
  ctx: MutationCtx,
  args: {
    repoId: Id<"githubRepos">;
    prUrl: string;
    prNumber: number;
    title: string;
    headSha: string;
    content: string;
    html?: string;
    prRecapStatus: "pending" | "ready" | "error";
    prRecapError?: string;
    clearActiveWorkflowId?: boolean;
    /** Set only when provided — never cleared on refresh, so Eva origin survives a regen. */
    prRecapOrigin?: "eva";
  },
): Promise<Id<"docs">> {
  const now = Date.now();
  const docsRepoId = await resolveCodebaseDocsRepoId(ctx.db, args.repoId);
  const existing = await ctx.db
    .query("docs")
    .withIndex("by_repo_and_pr_url", (q) =>
      q.eq("repoId", docsRepoId).eq("prUrl", args.prUrl),
    )
    .first();

  const markdownJson = markdownToDocJson(args.content);

  if (existing) {
    const shouldSnapshot =
      existing.prRecapStatus === "ready" &&
      existing.content.trim().length > 0 &&
      existing.content !== args.content;

    const snapshot = await ctx.runQuery(
      components.prosemirrorSync.lib.getSnapshot,
      { id: existing._id },
    );

    if (shouldSnapshot) {
      const pmContent =
        snapshot.content !== null
          ? JSON.stringify(snapshot.content)
          : JSON.stringify(markdownToDocJson(existing.content));
      await ctx.runMutation(internal.docVersions.saveRecapSnapshot, {
        docId: existing._id,
        title: existing.title,
        content: existing.content,
        pmContent,
        headSha: existing.headSha,
      });
    }

    if (snapshot.content !== null) {
      await ctx.runMutation(components.prosemirrorSync.lib.deleteDocument, {
        id: existing._id,
      });
    }
    await prosemirrorSync.create(ctx, existing._id, markdownJson);
    // The invariant is about the row that ends up stored, so it is checked
    // against the html this write leaves behind — a preserved walkthrough
    // included.
    const resolved = resolvePrRecapWrite({
      prRecapStatus: args.prRecapStatus,
      html: args.html ?? existing.html,
      prRecapError: args.prRecapError,
    });
    await ctx.db.patch(existing._id, {
      title: args.title,
      content: args.content,
      contentUpdatedAt: now,
      updatedAt: now,
      kind: "pr-recap",
      prUrl: args.prUrl,
      prNumber: args.prNumber,
      headSha: args.headSha,
      prRecapStatus: resolved.prRecapStatus,
      prRecapError: resolved.prRecapError,
      // Only overwrite html when the agent produced one, so a failed regen does
      // not wipe a previously generated walkthrough.
      ...(args.html !== undefined ? { html: args.html } : {}),
      ...(args.clearActiveWorkflowId ? { activeWorkflowId: undefined } : {}),
      ...(args.prRecapOrigin !== undefined
        ? { prRecapOrigin: args.prRecapOrigin }
        : {}),
    });
    return existing._id;
  }

  const inserted = resolvePrRecapWrite({
    prRecapStatus: args.prRecapStatus,
    html: args.html,
    prRecapError: args.prRecapError,
  });
  const docId = await ctx.db.insert("docs", {
    repoId: docsRepoId,
    kind: "pr-recap",
    title: args.title,
    content: args.content,
    html: args.html,
    prUrl: args.prUrl,
    prNumber: args.prNumber,
    headSha: args.headSha,
    prRecapStatus: inserted.prRecapStatus,
    prRecapError: inserted.prRecapError,
    ...(args.prRecapOrigin !== undefined
      ? { prRecapOrigin: args.prRecapOrigin }
      : {}),
    contentUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
    numId: await allocateNumId(ctx.db, docsRepoId, "docs"),
  });
  await prosemirrorSync.create(ctx, docId, markdownJson);
  return docId;
}

export const upsertPrRecapDoc = internalMutation({
  args: {
    repoId: v.id("githubRepos"),
    prUrl: v.string(),
    prNumber: v.number(),
    title: v.string(),
    headSha: v.string(),
    content: v.string(),
    html: v.optional(v.string()),
    prRecapStatus: prRecapStatusValidator,
    prRecapError: v.optional(v.string()),
    clearActiveWorkflowId: v.optional(v.boolean()),
  },
  returns: v.id("docs"),
  handler: async (ctx, args) => upsertPrRecapDocImpl(ctx, args),
});

/** Patches PR recap status fields without rewriting ProseMirror content. */
export const patchPrRecapStatus = internalMutation({
  args: {
    docId: v.id("docs"),
    prRecapStatus: prRecapStatusValidator,
    prRecapError: v.optional(v.string()),
    headSha: v.optional(v.string()),
    activeWorkflowId: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc) return null;

    // A status patch carries no html, so "ready" is judged against the doc's
    // stored walkthrough: without one the row would claim a recap it cannot
    // show.
    const resolved = resolvePrRecapWrite({
      prRecapStatus: args.prRecapStatus,
      html: doc.html,
      prRecapError: args.prRecapError,
    });

    const patch: {
      prRecapStatus: typeof args.prRecapStatus;
      prRecapError?: string;
      headSha?: string;
      activeWorkflowId?: string;
      updatedAt: number;
    } = {
      prRecapStatus: resolved.prRecapStatus,
      updatedAt: Date.now(),
    };

    if (resolved.prRecapError !== undefined) {
      patch.prRecapError = resolved.prRecapError;
    }
    if (args.headSha !== undefined) {
      patch.headSha = args.headSha;
    }
    if (args.activeWorkflowId !== undefined) {
      if (args.activeWorkflowId === null) {
        patch.activeWorkflowId = undefined;
      } else {
        patch.activeWorkflowId = args.activeWorkflowId;
      }
    }

    await ctx.db.patch(args.docId, patch);
    return null;
  },
});

const reviewerFeedbackItemValidator = v.object({
  anchorText: v.optional(v.string()),
  content: v.string(),
});

/**
 * Upserts a pending recap doc and starts prRecapWorkflow. Shared by the panel
 * Generate button and "Revise recap" from agent-targeted comments.
 */
export const startPrRecap = internalMutation({
  args: {
    repoId: v.id("githubRepos"),
    userId: v.id("users"),
    installationId: v.number(),
    owner: v.string(),
    name: v.string(),
    prUrl: v.string(),
    prNumber: v.number(),
    prTitle: v.string(),
    headSha: v.string(),
    pendingPlaceholder: v.optional(v.string()),
    reviewerFeedback: v.optional(v.array(reviewerFeedbackItemValidator)),
    consumeAgentCommentIds: v.optional(v.array(v.id("docComments"))),
    /** Absent falls back to the repo default; resolved here so the doc records the real model. */
    model: v.optional(aiModelValidator),
    ...modelTraitsExecutionFields,
  },
  returns: v.object({
    docId: v.id("docs"),
    workflowId: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ docId: Id<"docs">; workflowId: string }> => {
    const docsRepoId = await resolveCodebaseDocsRepoId(ctx.db, args.repoId);
    const siblings = await findSiblingRepos(ctx.db, args.repoId);
    const workflowRepo =
      siblings.find((repo) => repo.rootDirectory === undefined) ??
      (await ctx.db.get(args.repoId));

    if (!workflowRepo) {
      throw new Error("Repository not found");
    }

    const placeholder =
      args.pendingPlaceholder ??
      (args.reviewerFeedback && args.reviewerFeedback.length > 0
        ? "_Revising recap from feedback…_"
        : "_Generating recap…_");

    // Tag Eva-managed PRs so the docs Reviews sidebar hides them; those recaps
    // belong on the sandbox Review tab instead.
    const prRecapOrigin = (await isEvaOwnedPullRequest(ctx, args.prUrl))
      ? "eva"
      : undefined;

    const model = normalizeAIModel(
      args.model ?? workflowRepo.defaultModel ?? DEFAULT_AI_MODEL,
    );

    const docId: Id<"docs"> = await upsertPrRecapDocImpl(ctx, {
      repoId: docsRepoId,
      prUrl: args.prUrl,
      prNumber: args.prNumber,
      title: `PR #${args.prNumber} — ${args.prTitle}`,
      headSha: args.headSha,
      content: placeholder,
      prRecapStatus: "pending",
      ...(prRecapOrigin !== undefined ? { prRecapOrigin } : {}),
    });

    // Written unconditionally so unsetting a trait clears it from the doc.
    await ctx.db.patch(docId, {
      prRecapModel: model,
      reasoningLevel: args.reasoningLevel,
      thinkingEnabled: args.thinkingEnabled,
      use1mContext: args.use1mContext,
      fastMode: args.fastMode,
    });

    const workflowId = await workflow.start(
      ctx,
      internal.prRecapWorkflow.prRecapWorkflow,
      {
        docId,
        repoId: workflowRepo._id,
        installationId: args.installationId,
        userId: args.userId,
        prNumber: args.prNumber,
        prUrl: args.prUrl,
        prTitle: args.prTitle,
        headSha: args.headSha,
        reviewerFeedback: args.reviewerFeedback,
        consumeAgentCommentIds: args.consumeAgentCommentIds,
        model,
        reasoningLevel: args.reasoningLevel,
        thinkingEnabled: args.thinkingEnabled,
        use1mContext: args.use1mContext,
        fastMode: args.fastMode,
      },
    );

    await trackDocWorkflow(ctx, docId, workflowId);

    return { docId, workflowId: String(workflowId) };
  },
});

/** Starts a recap revision workflow from queued agent-targeted comments. */
export const reviseRecapFromFeedback = authMutation({
  args: { docId: v.id("docs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc || doc.kind !== "pr-recap") {
      throw new Error("PR recap not found");
    }
    if (!(await hasCodebaseRepoAccess(ctx.db, doc.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const pendingIds = doc.pendingAgentCommentIds ?? [];
    if (pendingIds.length === 0) {
      throw new Error("No pending agent feedback to revise from");
    }
    if (doc.activeWorkflowId) {
      throw new Error("A recap revision is already in progress");
    }
    if (
      doc.prUrl === undefined ||
      doc.prNumber === undefined ||
      doc.headSha === undefined
    ) {
      throw new Error("PR recap is missing pull request metadata");
    }

    const commentRows = await Promise.all(
      pendingIds.map((commentId) => ctx.db.get(commentId)),
    );
    const reviewerFeedback = commentRows
      .filter((comment) => comment !== null)
      .map((comment) => ({
        anchorText: comment.anchorText,
        content: comment.content,
      }));

    const siblings = await findSiblingRepos(ctx.db, doc.repoId);
    const workflowRepo =
      siblings.find((repo) => repo.rootDirectory === undefined) ?? siblings[0];
    if (!workflowRepo) {
      throw new Error("Repository not found");
    }

    const titleMatch = doc.title.match(/^PR #\d+ — (.+)$/);
    const prTitle = titleMatch ? titleMatch[1] : doc.title;

    await ctx.runMutation(internal.docs.startPrRecap, {
      repoId: workflowRepo._id,
      userId: ctx.userId,
      installationId: workflowRepo.installationId,
      owner: workflowRepo.owner,
      name: workflowRepo.name,
      prUrl: doc.prUrl,
      prNumber: doc.prNumber,
      prTitle,
      headSha: doc.headSha,
      reviewerFeedback,
      consumeAgentCommentIds: pendingIds,
      // A revision reruns on the setup that produced the recap being revised.
      model: doc.prRecapModel,
      reasoningLevel: doc.reasoningLevel,
      thinkingEnabled: doc.thinkingEnabled,
      use1mContext: doc.use1mContext,
      fastMode: doc.fastMode,
    });

    return null;
  },
});

/**
 * The three reasons the panel's Generate button refuses, as tagged errors so
 * `runActionEffect` can put them on `ConvexError.data` — a plain `Error` is
 * redacted to "Server Error" in production, which left the panel showing
 * nothing to act on. Anything else that can go wrong here (the metadata fetch,
 * starting the workflow) stays a defect and stays redacted: those are outages
 * or bugs, not answers to the user's request.
 */
class RecapNotAuthorized extends Data.TaggedError("RecapNotAuthorized")<{
  message: string;
}> {}

class RecapPrUrlInvalid extends Data.TaggedError("RecapPrUrlInvalid")<{
  message: string;
}> {}

class RecapAuthorNotRecapped extends Data.TaggedError(
  "RecapAuthorNotRecapped",
)<{ message: string }> {}

/** Panel Generate/Regenerate — the only path to a recap. Allows drafts (explicit intent). */
export const generatePrRecap = authAction({
  args: {
    repoId: v.id("githubRepos"),
    prUrl: v.string(),
    model: v.optional(aiModelValidator),
    ...modelTraitsExecutionFields,
  },
  returns: v.object({
    docId: v.id("docs"),
    workflowId: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ docId: Id<"docs">; workflowId: string }> =>
    runActionEffect(
      Effect.promise(() =>
        ctx.runQuery(internal._prRecapWorkflow.start.getManualRecapContext, {
          repoId: args.repoId,
          userId: ctx.userId,
        }),
      ).pipe(
        Effect.flatMap((context) =>
          context === null
            ? Effect.fail(new RecapNotAuthorized({ message: "Not authorized" }))
            : Effect.succeed(context),
        ),
        Effect.flatMap((context) => {
          const prNumber = extractPrNumberFromUrl(args.prUrl);
          return prNumber === null
            ? Effect.fail(
                new RecapPrUrlInvalid({ message: "Invalid pull request URL" }),
              )
            : Effect.succeed({ context, prNumber });
        }),
        Effect.flatMap(({ context, prNumber }) =>
          Effect.promise(() =>
            ctx.runAction(internal._github.prRecapService.fetchPrMetadata, {
              installationId: context.installationId,
              owner: context.owner,
              repo: context.name,
              prNumber,
            }),
          ).pipe(Effect.map((metadata) => ({ context, metadata }))),
        ),
        Effect.flatMap(({ context, metadata }) => {
          const authorLogin = metadata.authorLogin?.toLowerCase() ?? "";
          if (
            authorLogin.startsWith("dependabot") ||
            authorLogin.startsWith("renovate")
          ) {
            return Effect.fail(
              new RecapAuthorNotRecapped({
                message: "Bot-authored pull requests are not recapped",
              }),
            );
          }
          return Effect.promise(
            (): Promise<{ docId: Id<"docs">; workflowId: string }> =>
              ctx.runMutation(internal.docs.startPrRecap, {
                repoId: context.workflowRepoId,
                userId: ctx.userId,
                installationId: context.installationId,
                owner: context.owner,
                name: context.name,
                prUrl: metadata.prUrl,
                prNumber: metadata.prNumber,
                prTitle: metadata.prTitle,
                headSha: metadata.headSha,
                model: args.model,
                reasoningLevel: args.reasoningLevel,
                thinkingEnabled: args.thinkingEnabled,
                use1mContext: args.use1mContext,
                fastMode: args.fastMode,
              }),
          );
        }),
      ),
      `docs.generatePrRecap pr=${args.prUrl}`,
    ),
});
