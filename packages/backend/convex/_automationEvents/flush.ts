"use node";

import { v } from "convex/values";
import type { Octokit } from "octokit";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getInstallationOctokit } from "../githubAuth";
import { buildEvaTaskUrl } from "../_taskWorkflow/urls";
import {
  describeRepoEvent,
  repoEventValidator,
  TRUSTED_ASSOCIATIONS,
  type RepoEvent,
} from "./events";
import {
  buildCiFailureMessage,
  buildCiGiveUpMessage,
  buildIssueTaskDescription,
  buildReviewFeedbackMessage,
  MAX_CI_FIX_ATTEMPTS,
  tailLog,
  type FailedCheck,
  type FeedbackItem,
} from "./messages";

const FAILED_CONCLUSIONS = new Set(["failure", "timed_out", "startup_failure"]);
/** Only this many failed checks get their logs downloaded. */
const MAX_LOGGED_CHECKS = 3;
/**
 * Slack before the first webhook of a batch: a comment is created a moment
 * before GitHub delivers its webhook.
 */
const FEEDBACK_LOOKBACK_MS = 60_000;

interface RepoRef {
  octokit: Octokit;
  owner: string;
  repo: string;
}

/** Failed check runs on a commit, with log tails for GitHub Actions jobs. */
async function fetchFailedChecks(
  { octokit, owner, repo }: RepoRef,
  headSha: string,
): Promise<FailedCheck[]> {
  const res = await octokit.rest.checks.listForRef({
    owner,
    repo,
    ref: headSha,
    per_page: 100,
  });
  const failed = res.data.check_runs.filter(
    (run) => run.conclusion !== null && FAILED_CONCLUSIONS.has(run.conclusion),
  );
  return await Promise.all(
    failed.map(async (run, index) => {
      const summary =
        [run.output.title, run.output.summary]
          .filter((part) => part !== null && part !== "")
          .join("\n\n") || null;
      // An Actions check run's id is its job id. Other apps (Vercel, …) have
      // no downloadable log, so their output summary has to do.
      const isActions = run.app?.slug === "github-actions";
      const logTail =
        isActions && index < MAX_LOGGED_CHECKS
          ? await octokit.rest.actions
              .downloadJobLogsForWorkflowRun({ owner, repo, job_id: run.id })
              .then((logs) => tailLog(String(logs.data)))
              .catch(() => null)
          : null;
      return { name: run.name, url: run.html_url, summary, logTail };
    }),
  );
}

/** Trusted human feedback on a PR created after `since`, oldest first. */
async function fetchFeedbackSince(
  { octokit, owner, repo }: RepoRef,
  prNumber: number,
  since: number,
): Promise<FeedbackItem[]> {
  const [reviews, inline, comments] = await Promise.all([
    octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    }),
    octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: prNumber,
      since: new Date(since).toISOString(),
      per_page: 100,
    }),
    octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      since: new Date(since).toISOString(),
      per_page: 100,
    }),
  ]);

  const items: Array<FeedbackItem & { at: number }> = [];
  const accept = (
    user: { login: string; type: string } | null,
    association: string,
    createdAt: string | undefined,
  ): boolean =>
    user !== null &&
    user.type !== "Bot" &&
    TRUSTED_ASSOCIATIONS.has(association) &&
    createdAt !== undefined &&
    Date.parse(createdAt) >= since;

  for (const review of reviews.data) {
    if (!review.body?.trim()) continue;
    if (!accept(review.user, review.author_association, review.submitted_at)) {
      continue;
    }
    items.push({
      author: review.user?.login ?? "reviewer",
      body: review.body,
      url: review.html_url,
      path: null,
      line: null,
      at: Date.parse(review.submitted_at ?? ""),
    });
  }
  for (const comment of inline.data) {
    if (!accept(comment.user, comment.author_association, comment.created_at)) {
      continue;
    }
    items.push({
      author: comment.user.login,
      body: comment.body,
      url: comment.html_url,
      path: comment.path,
      line: comment.line ?? comment.original_line ?? null,
      at: Date.parse(comment.created_at),
    });
  }
  for (const comment of comments.data) {
    if (!comment.body?.trim()) continue;
    if (!accept(comment.user, comment.author_association, comment.created_at)) {
      continue;
    }
    items.push({
      author: comment.user?.login ?? "commenter",
      body: comment.body,
      url: comment.html_url,
      path: null,
      line: null,
      at: Date.parse(comment.created_at),
    });
  }
  return items
    .sort((a, b) => a.at - b.at)
    .map(({ at: _at, ...item }) => item);
}

/**
 * Runs one queued event run once its debounce has passed: starts an agent
 * run, posts into the PR's own chat, or creates a task for the issue.
 */
export const flush = internalAction({
  args: { runId: v.id("automationRuns"), event: repoEventValidator },
  returns: v.null(),
  handler: async (ctx, { runId, event }) => {
    const context = await ctx.runQuery(
      internal._automationEvents.dispatch.getFlushContext,
      { runId },
    );
    if (context === null) return null;

    const settle = async (
      status: "success" | "error" | "cancelled",
      message: string,
    ) => {
      await ctx.runMutation(internal.automations.updateRunStatus, {
        runId,
        status,
        ...(status === "error"
          ? { error: message }
          : { resultSummary: message }),
      });
    };

    try {
      if (context.action === "run") {
        await ctx.runMutation(internal.automations.startEventRun, {
          runId,
          context: describeRepoEvent(event),
        });
        return null;
      }

      const ref: RepoRef = {
        octokit: await getInstallationOctokit(context.installationId),
        owner: event.owner,
        repo: event.name,
      };

      if (context.action === "create_task") {
        if (event.kind !== "issue_labeled") {
          await settle("error", "Issues to tasks only handles labelled issues");
          return null;
        }
        const created = await ctx.runMutation(
          internal._automationEvents.dispatch.createTaskFromIssue,
          {
            runId,
            title: event.title,
            description: buildIssueTaskDescription({
              issueUrl: event.issueUrl,
              issueNumber: event.issueNumber,
              body: event.body,
              instructions: context.instructions,
            }),
          },
        );
        if (created === null) return null;
        await commentOnIssue(ref, event, created.taskId, context);
        await ctx.runMutation(internal.automations.updateRunStatus, {
          runId,
          status: "success",
        });
        return null;
      }

      // route_to_pr_chat
      if (context.chat === null) {
        await settle("cancelled", "The PR no longer belongs to an Eva chat");
        return null;
      }
      if (context.clerkUserId === null) {
        await settle("error", "The chat's owner has no linked sign-in");
        return null;
      }
      const message = await buildRoutedMessage(ref, event, context);
      if (message === null) {
        await settle("cancelled", "Nothing new to send");
        return null;
      }
      await ctx.runAction(internal.mcp.nodeActions.orchestratorSendMessage, {
        clerkUserId: context.clerkUserId,
        kind: context.chat.kind,
        id: context.chat.id,
        message,
        sentViaOrchestrator: true,
      });
      const chatLabel =
        context.chat.numId === undefined
          ? context.chat.kind
          : `${context.chat.kind} #${context.chat.numId}`;
      await settle(
        "success",
        event.kind === "ci_failed"
          ? `Sent CI failure to ${chatLabel}`
          : `Sent review feedback to ${chatLabel}`,
      );
    } catch (error) {
      await settle(
        "error",
        error instanceof Error ? error.message : "Event run failed",
      );
    }
    return null;
  },
});

type FlushContext = {
  instructions: string;
  deliveries: number;
  lastDeliveredAt: number | null;
  runStartedAt: number;
};

/** The chat message for a routed event, or null when it has gone stale. */
async function buildRoutedMessage(
  ref: RepoRef,
  event: RepoEvent,
  context: FlushContext,
): Promise<string | null> {
  if (event.kind === "ci_failed") {
    if (context.deliveries >= MAX_CI_FIX_ATTEMPTS) {
      return buildCiGiveUpMessage(event.prNumber);
    }
    // A newer push supersedes this failure; its own checks will report.
    const pr = await ref.octokit.rest.pulls.get({
      owner: ref.owner,
      repo: ref.repo,
      pull_number: event.prNumber,
    });
    if (pr.data.head.sha !== event.headSha || pr.data.state !== "open") {
      return null;
    }
    return buildCiFailureMessage({
      prUrl: event.prUrl,
      prNumber: event.prNumber,
      headSha: event.headSha,
      attempt: context.deliveries + 1,
      checks: await fetchFailedChecks(ref, event.headSha),
      instructions: context.instructions,
    });
  }
  if (event.kind === "pr_feedback") {
    const since =
      context.lastDeliveredAt ?? context.runStartedAt - FEEDBACK_LOOKBACK_MS;
    const items = await fetchFeedbackSince(ref, event.prNumber, since);
    if (items.length === 0) return null;
    return buildReviewFeedbackMessage({
      prUrl: event.prUrl,
      prNumber: event.prNumber,
      items,
      instructions: context.instructions,
    });
  }
  return null;
}

/** Links the new task from the issue, so the reporter can follow along. */
async function commentOnIssue(
  { octokit, owner, repo }: RepoRef,
  event: Extract<RepoEvent, { kind: "issue_labeled" }>,
  taskId: Id<"agentTasks">,
  context: { repoOwner: string; repoName: string; rootDirectory: string },
): Promise<void> {
  const url = buildEvaTaskUrl(
    context.repoOwner,
    context.repoName,
    taskId,
    undefined,
    context.rootDirectory || undefined,
  );
  await octokit.rest.issues
    .createComment({
      owner,
      repo,
      issue_number: event.issueNumber,
      body: `Eva is working on this: [view the task](${url}). A pull request will link back here when it is ready.`,
    })
    // The task is already running; a missing Issues permission must not fail it.
    .catch(() => undefined);
}
