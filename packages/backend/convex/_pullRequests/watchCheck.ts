"use node";

import { v } from "convex/values";
import { z } from "zod";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getInstallationOctokit } from "../githubAuth";
import { fetchFeedback, type RepoRef } from "../_automationEvents/flush";
import {
  buildPrWatchMessage,
  evaluatePrWatch,
  PR_WATCH_RETRY_MS,
  PR_WATCH_UNREADABLE_MS,
  type Mergeability,
  type WatchedCheck,
} from "./watchEvaluate";

/**
 * One GraphQL read gives the PR's state, head, mergeability and every check on
 * the head commit — check runs and commit statuses (Vercel and the like) —
 * with whether branch protection or a ruleset requires each one.
 */
const PR_WATCH_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      state
      headRefOid
      mergeable
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100) {
                nodes {
                  __typename
                  ... on CheckRun {
                    name
                    status
                    conclusion
                    detailsUrl
                    isRequired(pullRequestNumber: $number)
                  }
                  ... on StatusContext {
                    context
                    state
                    targetUrl
                    isRequired(pullRequestNumber: $number)
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

const checkNodeSchema = z.union([
  z.object({
    __typename: z.literal("CheckRun"),
    name: z.string(),
    status: z.string(),
    conclusion: z.string().nullable(),
    detailsUrl: z.string().nullable(),
    isRequired: z.boolean().catch(false),
  }),
  z.object({
    __typename: z.literal("StatusContext"),
    context: z.string(),
    state: z.string(),
    targetUrl: z.string().nullable(),
    isRequired: z.boolean().catch(false),
  }),
  z.object({ __typename: z.string() }),
]);

const prWatchResponseSchema = z.object({
  repository: z.object({
    pullRequest: z.object({
      state: z.string(),
      headRefOid: z.string(),
      mergeable: z.string(),
      commits: z.object({
        nodes: z.array(
          z.object({
            commit: z.object({
              statusCheckRollup: z
                .object({
                  contexts: z.object({ nodes: z.array(checkNodeSchema) }),
                })
                .nullable(),
            }),
          }),
        ),
      }),
    }),
  }),
});

/** Conclusions a person or the agent has to look at. */
const FAILED_CONCLUSIONS = new Set([
  "FAILURE",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
]);

function toCheck(
  node: z.infer<typeof checkNodeSchema>,
): WatchedCheck | null {
  if ("name" in node) {
    const done = node.status === "COMPLETED";
    const failed = done && FAILED_CONCLUSIONS.has(node.conclusion ?? "");
    return {
      name: node.name,
      state: !done ? "pending" : failed ? "failed" : "passed",
      conclusion: node.conclusion?.toLowerCase() ?? null,
      required: node.isRequired,
      url: node.detailsUrl,
    };
  }
  if ("context" in node) {
    const failed = node.state === "FAILURE" || node.state === "ERROR";
    return {
      name: node.context,
      state:
        node.state === "SUCCESS" ? "passed" : failed ? "failed" : "pending",
      conclusion: failed ? node.state.toLowerCase() : null,
      required: node.isRequired,
      url: node.targetUrl,
    };
  }
  return null;
}

function toMergeability(value: string): Mergeability {
  if (value === "CONFLICTING") return "conflicting";
  if (value === "MERGEABLE") return "mergeable";
  return "unknown";
}

async function readPullRequest(ref: RepoRef, prNumber: number) {
  const data = prWatchResponseSchema.parse(
    await ref.octokit.graphql(PR_WATCH_QUERY, {
      owner: ref.owner,
      name: ref.repo,
      number: prNumber,
    }),
  );
  const pr = data.repository.pullRequest;
  const nodes =
    pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? [];
  return {
    open: pr.state === "OPEN",
    headSha: pr.headRefOid,
    mergeability: toMergeability(pr.mergeable),
    checks: nodes.flatMap((node) => toCheck(node) ?? []),
  };
}

/**
 * One debounced check of a watched PR: read it, compare with what the agent
 * was told, and wake the chat when something changed. A failed read or send
 * retries until the PR has been unreadable for 15 minutes, then the watch ends.
 */
export const check = internalAction({
  args: { pullRequestId: v.id("pullRequests"), checkAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { pullRequestId, checkAt }) => {
    const claimed = await ctx.runMutation(
      internal._pullRequests.watch.claimCheck,
      { pullRequestId, checkAt },
    );
    if (claimed === null) return null;
    const { watch, target } = claimed;
    const record = async (
      next: typeof watch | null,
      retryInMs?: number,
    ): Promise<void> => {
      await ctx.runMutation(internal._pullRequests.watch.recordCheck, {
        pullRequestId,
        startedAt: watch.startedAt,
        next,
        ...(retryInMs === undefined ? {} : { retryInMs }),
      });
    };

    try {
      const ref: RepoRef = {
        octokit: await getInstallationOctokit(claimed.installationId),
        owner: claimed.owner,
        repo: claimed.name,
      };
      const pr = await readPullRequest(ref, claimed.prNumber);
      // Merged or closed: the pull_request webhook ends the watch too.
      if (!pr.open) {
        await record(null);
        return null;
      }
      const feedback = await fetchFeedback(
        ref,
        claimed.prNumber,
        watch.remarksThrough,
      );
      const report = evaluatePrWatch(watch, {
        headSha: pr.headSha,
        checks: pr.checks,
        mergeability: pr.mergeability,
        remarks: feedback.items,
        remarksNewestAt: feedback.newestAt,
      });
      if (report.changes.length > 0) {
        // Same delivery as the CI and review automations: starts a turn, or
        // queues behind the one already running.
        await ctx.runAction(internal.mcp.nodeActions.orchestratorSendMessage, {
          clerkUserId: target.clerkUserId,
          kind: target.kind,
          id: target.id,
          ...(target.chat === undefined ? {} : { chat: target.chat }),
          message: buildPrWatchMessage({
            prNumber: claimed.prNumber,
            prUrl: claimed.prUrl,
            baseBranch: claimed.baseBranch,
            headSha: pr.headSha,
            report,
          }),
          sentViaOrchestrator: true,
        });
      }
      await record(report.exhausted ? null : report.next);
    } catch (error) {
      console.error(
        `[prWatch] check failed for ${claimed.prUrl}:`,
        error instanceof Error ? error.message : error,
      );
      const now = Date.now();
      const since = watch.unreadableSince ?? now;
      if (now - since >= PR_WATCH_UNREADABLE_MS) {
        await record(null);
      } else {
        await record({ ...watch, unreadableSince: since }, PR_WATCH_RETRY_MS);
      }
    }
    return null;
  },
});
