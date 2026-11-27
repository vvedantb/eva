import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { getInstallationOctokit } from "../githubAuth";
import { buildEvaAutomationUrl } from "../_env/webAppUrl";
import { extractPrNumber } from "../_github/prUrl";
import { resolveAutomationDoc } from "./systemAutomations";

/**
 * A finished PR-event run posts its result as a new PR comment, then hides
 * the comment the automation's previous run left on that PR as "outdated".
 * The newest result stays at the bottom of the timeline, with a notification,
 * and older ones fold away. Best-effort, like the check run.
 */

/** GitHub rejects a comment body over 65,536 characters. */
const MAX_BODY_CHARS = 60_000;

/** Posts the run's comment once it succeeds. Only PR-event runs have a head. */
export async function postRunCommentLater(
  ctx: MutationCtx,
  run: Doc<"automationRuns">,
): Promise<void> {
  if (run.headSha === undefined || run.targetUrl === undefined) return;
  await ctx.scheduler.runAfter(
    0,
    internal._automations.prComment.postRunComment,
    { runId: run._id },
  );
}

const commentContextValidator = v.object({
  installationId: v.number(),
  owner: v.string(),
  name: v.string(),
  rootDirectory: v.optional(v.string()),
  prNumber: v.number(),
  headSha: v.string(),
  title: v.string(),
  automationNumId: v.optional(v.number()),
  resultSummary: v.string(),
  /** The comment this automation's previous run on the PR left, to hide. */
  previousCommentNodeId: v.optional(v.string()),
});

export const getCommentContext = internalQuery({
  args: { runId: v.id("automationRuns") },
  returns: v.union(v.null(), commentContextValidator),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (
      !run ||
      run.status !== "success" ||
      run.commentNodeId !== undefined ||
      run.headSha === undefined ||
      run.targetUrl === undefined ||
      !run.resultSummary?.trim()
    ) {
      return null;
    }
    const prNumber = extractPrNumber(run.targetUrl);
    const stored = await ctx.db.get(run.automationId);
    const repo = await ctx.db.get(run.repoId);
    if (prNumber === null || !stored || !repo) return null;
    const automation = resolveAutomationDoc(stored);
    const targetUrl = run.targetUrl;
    const earlier = await ctx.db
      .query("automationRuns")
      .withIndex("by_automation_and_targetUrl", (q) =>
        q.eq("automationId", run.automationId).eq("targetUrl", targetUrl),
      )
      .order("desc")
      .collect();
    const previous = earlier.find(
      (other) => other._id !== runId && other.commentNodeId !== undefined,
    );
    return {
      installationId: repo.installationId,
      owner: repo.owner,
      name: repo.name,
      rootDirectory: repo.rootDirectory,
      prNumber,
      headSha: run.headSha,
      title: automation.title,
      automationNumId: automation.numId,
      resultSummary: run.resultSummary,
      previousCommentNodeId: previous?.commentNodeId,
    };
  },
});

export const setCommentNodeId = internalMutation({
  args: { runId: v.id("automationRuns"), commentNodeId: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, commentNodeId }) => {
    await ctx.db.patch(runId, { commentNodeId });
    return null;
  },
});

/** The comment: the automation, the commit it ran on, its result, a link. */
export function runCommentBody(input: {
  title: string;
  headSha: string;
  resultSummary: string;
  detailsUrl: string | undefined;
}): string {
  return [
    `**Eva: ${input.title}** · ${input.headSha.slice(0, 7)}`,
    input.resultSummary.trim().slice(0, MAX_BODY_CHARS),
    input.detailsUrl === undefined ? null : `[Open in Eva](${input.detailsUrl})`,
  ]
    .filter((part) => part !== null)
    .join("\n\n");
}

const MINIMIZE_COMMENT = `mutation($id: ID!) {
  minimizeComment(input: { subjectId: $id, classifier: OUTDATED }) {
    clientMutationId
  }
}`;

export const postRunComment = internalAction({
  args: { runId: v.id("automationRuns") },
  returns: v.null(),
  handler: async (ctx, { runId }): Promise<null> => {
    const context = await ctx.runQuery(
      internal._automations.prComment.getCommentContext,
      { runId },
    );
    if (context === null) return null;
    try {
      const octokit = await getInstallationOctokit(context.installationId);
      const { data } = await octokit.rest.issues.createComment({
        owner: context.owner,
        repo: context.name,
        issue_number: context.prNumber,
        body: runCommentBody({
          title: context.title,
          headSha: context.headSha,
          resultSummary: context.resultSummary,
          detailsUrl:
            context.automationNumId === undefined
              ? undefined
              : buildEvaAutomationUrl(
                  context.owner,
                  context.name,
                  context.automationNumId,
                  "run-history",
                  context.rootDirectory,
                ),
        }),
      });
      await ctx.runMutation(internal._automations.prComment.setCommentNodeId, {
        runId,
        commentNodeId: data.node_id,
      });
      // Hidden only once the new one is up, so the PR never shows neither.
      if (context.previousCommentNodeId !== undefined) {
        await octokit.graphql(MINIMIZE_COMMENT, {
          id: context.previousCommentNodeId,
        });
      }
    } catch (error) {
      console.error(
        `[automations] could not post PR comment runId=${runId}`,
        error,
      );
    }
    return null;
  },
});
