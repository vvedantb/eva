import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { authQuery, hasRepoAccess } from "../functions";
import { allocateNumId, entityVisible, isEntityDeleted } from "../numId";
import { prosemirrorSync } from "../prosemirrorSync";
import { markdownToDocJson } from "../_docEditor/markdown";
import { replaceDocBody } from "../_docs/body";
import { docValidator } from "../docs";

/**
 * The project summary (the "ledger" the coordinator keeps): one `docs` row
 * for each project, named by `projects.summaryDocId` and filed under the
 * project as its chat source, so it also lists in the project's Documents.
 */

/**
 * Writes a project's summary doc. The first call creates it in the home repo;
 * later calls replace its whole body (`replaceDocBody`). A deleted summary
 * doc is replaced by a new one. No access check: callers check first.
 */
export async function upsertProjectSummary(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  markdown: string,
): Promise<Id<"docs">> {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");
  const existing = project.summaryDocId
    ? await ctx.db.get(project.summaryDocId)
    : null;
  if (existing && !isEntityDeleted(existing)) {
    await replaceDocBody(ctx, existing._id, markdown);
    return existing._id;
  }
  const now = Date.now();
  const docId = await ctx.db.insert("docs", {
    repoId: project.repoId,
    sourceKind: "project",
    sourceProjectId: projectId,
    title: `${project.title} summary`,
    content: markdown,
    contentUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
    numId: await allocateNumId(ctx.db, project.repoId, "docs"),
  });
  await prosemirrorSync.create(ctx, docId, markdownToDocJson(markdown));
  await ctx.db.patch(projectId, { summaryDocId: docId });
  return docId;
}

/** A project's summary doc, or null before the coordinator writes one or without access. */
export const getSummaryDoc = authQuery({
  args: { projectId: v.id("projects") },
  returns: v.union(docValidator, v.null()),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project?.summaryDocId) return null;
    if (!(await hasRepoAccess(ctx.db, project.repoId, ctx.userId))) return null;
    return entityVisible(await ctx.db.get(project.summaryDocId));
  },
});
