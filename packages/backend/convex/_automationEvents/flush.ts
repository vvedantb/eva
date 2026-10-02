"use node";

import { v } from "convex/values";
import type { Octokit } from "octokit";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getInstallationOctokit } from "../githubAuth";
import { buildEvaTaskUrl } from "../_taskWorkflow/urls";
import {
  ciPassedValidator,
  describeRepoEvent,
  repoEventValidator,
  type RepoEvent,
} from "./events";
import {
  buildCiFailureMessage,
  buildCiGiveUpMessage,
  buildIssueTaskDescription,
  buildReviewFeedbackMessage,
  collectFeedback,
  MAX_CI_FIX_ATTEMPTS,
  tailLog,
  type FailedCheck,
} from "./messages";

const FAILED_CONCLUSIONS = new Set(["failure", "timed_out", "startup_failure"]);
/** Only this many failed checks get their logs downloaded. */
const MAX_LOGGED_CHECKS = 3;
/**
 * Slack before the first webhook of a batch: a comment is created a moment
 * before GitHub delivers its webhook.
 */
const FEEDBACK_LOOKBACK_MS = 60_000;
/** How long a review batch waits for an earlier one for the same PR. */
const SIBLING_RETRY_MS = 30_000;

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
  const runs = await octokit.paginate(octokit.rest.checks.listForRef, {
    owner,
    repo,
    ref: headSha,
    per_page: 100,
  });
  const failed = runs.filter(
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

/**
 * Review feedback on a PR newer than `after`. Every page, so a long-running PR
 * past 100 reviews or comments still has its newest ones seen.
 */
async function fetchFeedback(
  { octokit, owner, repo }: RepoRef,
  prNumber: number,
  after: number,
): Promise<ReturnType<typeof collectFeedback>> {
  const since = new Date(after).toISOString();
  const [reviews, inline, comments] = await Promise.all([
    octokit.paginate(octokit.rest.pulls.listReviews, {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    }),
    octokit.paginate(octokit.rest.pulls.listReviewComments, {
      owner,
      repo,
      pull_number: prNumber,
      since,
      per_page: 100,
    }),
    octokit.paginate(octokit.rest.issues.listComments, {
      owner,
      repo,
      issue_number: prNumber,
      since,
      per_page: 100,
    }),
  ]);
  return collectFeedback({ reviews, inline, comments }, after);
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

    if (context.action === "run") {
      // Agent runs settle through their workflow, like a cron run.
      await ctx.runMutation(internal.automations.startEventRun, {
        runId,
        context: describeRepoEvent(event),
      });
      return null;
    }

    // An earlier batch for this PR is still sending; its cursor decides where
    // this one starts, so wait for it rather than overlap.
    if (context.siblingRunning) {
      await ctx.scheduler.runAfter(
        SIBLING_RETRY_MS,
        internal._automationEvents.flush.flush,
        { runId, event },
      );
      return null;
    }
    const claimed = await ctx.runMutation(
      internal._automationEvents.dispatch.claimEventRun,
      { runId },
    );
    if (!claimed) return null;

    const settle = async (
      status: "success" | "error" | "cancelled",
      message: string,
      eventCursor?: number,
    ) => {
      await ctx.runMutation(
        internal._automationEvents.dispatch.settleEventRun,
        {
          runId,
          status,
          message,
          eventCursor,
        },
      );
    };

    try {
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
        if (created === null) {
          await settle("cancelled", "A task already exists for this issue");
          return null;
        }
        // The task exists and is starting; the link comment is a courtesy.
        try {
          await commentOnIssue(ref, event, created.taskId, context);
        } catch {
          // Missing Issues permission or WEB_APP_URL: the task still runs.
        }
        await settle("success", `Created quick task #${created.numId}`);
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
      const routed = await buildRoutedMessage(ref, event, context);
      if (routed === null) {
        await settle("cancelled", "Nothing new to send");
        return null;
      }
      await ctx.runAction(internal.mcp.nodeActions.orchestratorSendMessage, {
        clerkUserId: context.clerkUserId,
        kind: context.chat.kind,
        id: context.chat.id,
        message: routed.message,
        sentViaOrchestrator: true,
      });
      const chatLabel =
        context.chat.numId === undefined
          ? context.chat.kind
          : `${context.chat.kind} #${context.chat.numId}`;
      await settle("success", routed.summary(chatLabel), routed.cursor);
    } catch (error) {
      await settle(
        "error",
        error instanceof Error ? error.message : "Event run failed",
      );
    }
    return null;
  },
});

/**
 * A commit is green once every check run on it has completed and none
 * failed. Only then do past CI fix attempts stop counting toward the cap.
 */
export const confirmCiGreen = internalAction({
  args: {
    passed: ciPassedValidator,
    automationIds: v.array(v.id("automations")),
    installationId: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { passed, automationIds, installationId }) => {
    const octokit = await getInstallationOctokit(installationId);
    const owner = passed.owner;
    const repo = passed.name;
    const pr = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: passed.prNumber,
    });
    // A green old commit says nothing about the PR as it is now.
    if (pr.data.head.sha !== passed.headSha) return null;
    const runs = await octokit.paginate(octokit.rest.checks.listForRef, {
      owner,
      repo,
      ref: passed.headSha,
      per_page: 100,
    });
    const green = runs.every(
      (run) =>
        run.status === "completed" &&
        (run.conclusion === null || !FAILED_CONCLUSIONS.has(run.conclusion)),
    );
    if (!green) return null;
    await ctx.runMutation(internal._automationEvents.dispatch.resetCiAttempts, {
      automationIds,
      prUrl: passed.prUrl,
    });
    return null;
  },
});

type FlushContext = {
  instructions: string;
  ciAttempts: number;
  feedbackCursor: number | null;
  runStartedAt: number;
};

interface RoutedMessage {
  message: string;
  /** Run-history line, given the chat's label ("session #12"). */
  summary: (chatLabel: string) => string;
  /** Review runs: where the next batch starts. */
  cursor?: number;
}

/** The chat message for a routed event, or null when it has gone stale. */
async function buildRoutedMessage(
  ref: RepoRef,
  event: RepoEvent,
  context: FlushContext,
): Promise<RoutedMessage | null> {
  if (event.kind === "ci_failed") {
    if (context.ciAttempts >= MAX_CI_FIX_ATTEMPTS) {
      return {
        message: buildCiGiveUpMessage(event.prNumber),
        summary: (chat) =>
          `Stopped CI auto-fix after ${MAX_CI_FIX_ATTEMPTS} attempts (${chat})`,
      };
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
    const attempt = context.ciAttempts + 1;
    return {
      message: buildCiFailureMessage({
        prUrl: event.prUrl,
        prNumber: event.prNumber,
        headSha: event.headSha,
        attempt,
        checks: await fetchFailedChecks(ref, event.headSha),
        instructions: context.instructions,
      }),
      summary: (chat) =>
        `Sent CI failure to ${chat} (attempt ${attempt} of ${MAX_CI_FIX_ATTEMPTS})`,
    };
  }
  if (event.kind === "pr_feedback") {
    const after =
      context.feedbackCursor ?? context.runStartedAt - FEEDBACK_LOOKBACK_MS;
    const { items, newestAt } = await fetchFeedback(ref, event.prNumber, after);
    if (items.length === 0 || newestAt === null) return null;
    return {
      message: buildReviewFeedbackMessage({
        prUrl: event.prUrl,
        prNumber: event.prNumber,
        items,
        instructions: context.instructions,
      }),
      summary: (chat) =>
        `Sent ${items.length} review comment${items.length === 1 ? "" : "s"} to ${chat}`,
      cursor: newestAt,
    };
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
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: event.issueNumber,
    body: `Eva is working on this: [view the task](${url}). A pull request will link back here when it is ready.`,
  });
}
