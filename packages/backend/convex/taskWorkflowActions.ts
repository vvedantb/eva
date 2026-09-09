"use node";

import { v } from "convex/values";
import type { GenericActionCtx } from "convex/server";
import { Effect } from "effect";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { getInstallationOctokit } from "./githubAuth";
import { extractPrNumber } from "./_github/helpers";
import {
  GitHubBranchNotAhead,
  type GitHubFailure,
  githubRequest,
  originalGitHubError,
} from "./_github/githubErrors";
import { classifyPrActionFailure } from "./_github/prErrors";
import {
  runActionEffect,
  type UnexpectedActionFailure,
} from "./_effect/action";
import { getActionRepoWithAccess } from "./functions";
import {
  buildPrBody,
  buildTaskPrSections,
  buildProjectPrSections,
} from "./prBody";
import { buildEvaTaskUrl, buildEvaProjectUrl } from "./_taskWorkflow/urls";
import { retryAfterDelays, runPromiseRethrowing } from "./_effect/retry";
import {
  MAX_POLL_ATTEMPTS,
  POLL_INTERVAL_MS,
  isTerminalDeploymentStatus,
  resolveStableDeploymentUrl,
  type DeploymentStatus,
} from "./_taskWorkflow/deploymentHelpers";
import { fetchGitHubDeploymentSnapshot } from "./_github/deploymentSnapshot";

// Re-export URL builders for backwards compatibility
export { buildEvaTaskUrl, buildEvaSessionUrl } from "./_taskWorkflow/urls";

/** Waits between the seven compare attempts, so six gaps. */
const PR_READY_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 12000, 16000];

type PullRequestCreateParams = {
  installationId: number;
  repoOwner: string;
  repoName: string;
  branchName: string;
  baseBranch?: string;
  title: string;
  body: string;
  labels: string[];
  draft?: boolean;
};

/**
 * A PR eva just created carries its number so labels can be added. One adopted
 * after losing a create race does not: it already has the labels its own
 * creation applied.
 */
type PullRequestOutcome = { url: string; createdNumber?: number };

type PullRequestRefreshParams = {
  installationId: number;
  repoOwner: string;
  repoName: string;
  branchName: string;
  body: string;
};

function buildTaskPullRequestBody(params: {
  repoOwner: string;
  repoName: string;
  taskId: Id<"agentTasks">;
  projectId: Id<"projects"> | undefined;
  taskDescription: string | undefined;
  rootDirectory: string;
  changeRequests: string[];
}): string {
  const sections = buildTaskPrSections(
    params.taskDescription,
    params.changeRequests,
  );
  const evaUrl = buildEvaTaskUrl(
    params.repoOwner,
    params.repoName,
    params.taskId,
    params.projectId,
    params.rootDirectory || undefined,
  );
  return buildPrBody(sections, evaUrl);
}

function buildTaskPullRequestLabels(params: {
  rootDirectory: string;
  isQuickTask: boolean;
}): string[] {
  return [
    "eva",
    params.isQuickTask ? "quick-task" : "project",
    ...(params.rootDirectory
      ? [params.rootDirectory.split("/").pop()].filter(
          (label): label is string => label !== undefined && label !== "",
        )
      : []),
  ];
}

async function findOpenPullRequestForBranch(params: {
  installationId: number;
  repoOwner: string;
  repoName: string;
  branchName: string;
}): Promise<{ url: string; number: number; body: string | null } | null> {
  const octokit = await getInstallationOctokit(params.installationId);
  const pulls = await octokit.rest.pulls.list({
    owner: params.repoOwner,
    repo: params.repoName,
    state: "open",
    head: `${params.repoOwner}:${params.branchName}`,
    per_page: 1,
  });
  const pr = pulls.data[0];
  if (!pr) return null;
  return { url: pr.html_url, number: pr.number, body: pr.body };
}

async function createPullRequestWithGitHub(
  args: PullRequestCreateParams,
): Promise<string> {
  const octokit = await getInstallationOctokit(args.installationId);
  const baseBranch = args.baseBranch ?? FALLBACK_GIT_BASE_BRANCH;
  const existingPr = await findOpenPullRequestForBranch(args);
  if (existingPr) {
    await octokit.rest.pulls.update({
      owner: args.repoOwner,
      repo: args.repoName,
      pull_number: existingPr.number,
      title: `Eva: ${args.title}`,
      body: args.body,
      base: baseBranch,
    });
    return existingPr.url;
  }

  await waitForPullRequestHead({
    octokit,
    repoOwner: args.repoOwner,
    repoName: args.repoName,
    branchName: args.branchName,
    baseBranch,
  });

  const outcome = await runPromiseRethrowing(
    githubRequest(() =>
      octokit.rest.pulls.create({
        owner: args.repoOwner,
        repo: args.repoName,
        title: `Eva: ${args.title}`,
        body: args.body,
        head: args.branchName,
        base: baseBranch,
        draft: args.draft ?? false,
      }),
    ).pipe(
      Effect.map(
        (pr): PullRequestOutcome => ({
          url: pr.data.html_url,
          createdNumber: pr.data.number,
        }),
      ),
      // Concurrent create or list lag: adopt the existing PR instead of failing.
      Effect.catchIf(
        (failure) => failure._tag === "GitHubPullRequestAlreadyExists",
        (failure) =>
          // A single immediate re-lookup would hit the same stale list, so back
          // off between tries. `fromNullable` turns "still not listed" into the
          // failure the retry schedule waits on; a lookup that itself throws is
          // a defect and surfaces straight away. Still not listed after the last
          // try means there is nothing to adopt, so the create failure stands.
          Effect.promise(() => findOpenPullRequestForBranch(args)).pipe(
            Effect.flatMap(Effect.fromNullable),
            Effect.retry(retryAfterDelays([1000, 2000])),
            Effect.map((pr): PullRequestOutcome => ({ url: pr.url })),
            Effect.orElseFail(() => failure),
          ),
      ),
      Effect.mapError(originalGitHubError),
    ),
  );

  if (outcome.createdNumber !== undefined && args.labels.length > 0) {
    try {
      await octokit.rest.issues.addLabels({
        owner: args.repoOwner,
        repo: args.repoName,
        issue_number: outcome.createdNumber,
        labels: args.labels,
      });
    } catch (labelError) {
      console.error(
        `Failed to add labels to PR ${outcome.url}: ${labelError instanceof Error ? labelError.message : String(labelError)}`,
      );
    }
  }

  return outcome.url;
}

async function refreshPullRequestBodyWithGitHub(
  args: PullRequestRefreshParams,
): Promise<string> {
  const octokit = await getInstallationOctokit(args.installationId);
  const pr = await findOpenPullRequestForBranch(args);
  if (!pr) {
    throw new Error(
      `No open pull request found for ${args.repoOwner}/${args.repoName}:${args.branchName}`,
    );
  }

  await octokit.rest.pulls.update({
    owner: args.repoOwner,
    repo: args.repoName,
    pull_number: pr.number,
    body: args.body,
  });
  return pr.url;
}

async function waitForPullRequestHead(params: {
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>;
  repoOwner: string;
  repoName: string;
  branchName: string;
  baseBranch: string;
}): Promise<void> {
  let lastError = "";
  const compareHead = githubRequest(() =>
    params.octokit.rest.repos.compareCommitsWithBasehead({
      owner: params.repoOwner,
      repo: params.repoName,
      basehead: `${params.baseBranch}...${params.branchName}`,
      per_page: 1,
    }),
  ).pipe(
    Effect.flatMap((comparison) =>
      comparison.data.ahead_by > 0
        ? Effect.void
        : // Compare succeeded: GitHub sees both tips and head is not ahead.
          // Retrying won't create commits — fail immediately (plan-only turns).
          // The message is what callers past the action boundary match on, so
          // it has to stay recognisable to `isBranchNotAheadError`.
          Effect.fail(
            new GitHubBranchNotAhead({
              message: `${params.branchName} is not ahead of ${params.baseBranch}: every commit on it is already in ${params.baseBranch}, or the run committed locally and its push to GitHub failed`,
              cause: undefined,
            }),
          ),
    ),
  );

  await runPromiseRethrowing(
    compareHead.pipe(
      Effect.tapError((failure) =>
        Effect.sync(() => {
          if (failure._tag === "GitHubBranchNotAhead") return;
          // Branch may not be visible yet right after push — keep retrying.
          lastError = failure.message || "GitHub compare failed";
        }),
      ),
      Effect.retry({
        schedule: retryAfterDelays(PR_READY_RETRY_DELAYS_MS),
        while: (failure) => failure._tag !== "GitHubBranchNotAhead",
      }),
      // Only the sentinel survives, and it is thrown as itself: it carries the
      // message, and its cause is Eva rather than GitHub.
      Effect.catchIf(
        (failure) => failure._tag !== "GitHubBranchNotAhead",
        () =>
          Effect.fail(
            new Error(
              `GitHub did not report ${params.branchName} as ready for a pull request after branch push: ${lastError}`,
            ),
          ),
      ),
    ),
  );
}

/**
 * Runs a manual PR attempt so its failure reaches the user.
 *
 * Production Convex redacts plain `Error` messages, so every reason a manual
 * "Create PR" can fail — branch not ahead, missing base branch, GitHub
 * rejection — reached the user as a bare "Server Error" with nothing to act on.
 * {@link runActionEffect} rethrows as a `ConvexError`, whose data does cross the
 * wire, and `classifyPrActionFailure` gives GitHub-shaped failures a tag the web
 * can branch on instead of matching message text.
 */
function visiblePrAttempt<T>(
  attempt: () => Promise<T>,
): Effect.Effect<T, GitHubFailure | UnexpectedActionFailure> {
  return Effect.tryPromise({ try: attempt, catch: classifyPrActionFailure });
}

/** Manually creates the PR for a task branch — used when the workflow's auto
 * PR step failed. Idempotent: returns the existing PR URL if one is already
 * tracked on a run. The body matches the format the workflow would produce. */
export const createTaskPr = action({
  args: { taskId: v.id("agentTasks") },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args): Promise<{ url: string }> =>
    runActionEffect(
      visiblePrAttempt(async (): Promise<{ url: string }> => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
          throw new Error("Not authenticated");
        }

        const data = await ctx.runQuery(
          internal.taskWorkflow.getTaskPrCreationData,
          { taskId: args.taskId },
        );
        await getActionRepoWithAccess(ctx, data.repoId);

        if (data.existingPrUrl) {
          return { url: data.existingPrUrl };
        }

        const body = buildTaskPullRequestBody({
          repoOwner: data.repoOwner,
          repoName: data.repoName,
          taskId: args.taskId,
          projectId: data.projectId,
          taskDescription: data.taskDescription,
          rootDirectory: data.rootDirectory,
          changeRequests: data.changeRequests,
        });

        const labels = buildTaskPullRequestLabels({
          rootDirectory: data.rootDirectory,
          isQuickTask: data.isQuickTask,
        });

        const prUrl: string = await ctx.runAction(
          internal.taskWorkflowActions.createPullRequest,
          {
            installationId: data.installationId,
            repoOwner: data.repoOwner,
            repoName: data.repoName,
            branchName: data.branchName,
            baseBranch: data.baseBranch,
            title: data.taskTitle,
            body,
            labels,
            draft: data.isQuickTask,
          },
        );

        if (data.latestRunId) {
          await ctx.runMutation(internal.taskWorkflow.setRunPrUrl, {
            runId: data.latestRunId,
            prUrl,
          });
        }

        return { url: prUrl };
      }),
      `pr createTaskPr task=${args.taskId}`,
    ),
});

/** Manually creates the PR for a project branch — used when the workflow's
 * auto PR step (driven by the first task to complete) failed. Idempotent:
 * returns the existing PR URL if one is already tracked on the project. The
 * body summarises the project and lists tasks that have completed at least
 * one successful run, so users can recover even after multiple tasks have
 * landed without a PR. */
export const createProjectPr = action({
  args: { projectId: v.id("projects") },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args): Promise<{ url: string }> =>
    runActionEffect(
      visiblePrAttempt(async (): Promise<{ url: string }> => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
          throw new Error("Not authenticated");
        }

        const data = await ctx.runQuery(
          internal.projects.getProjectPrCreationData,
          { projectId: args.projectId },
        );
        await getActionRepoWithAccess(ctx, data.repoId);

        if (data.existingPrUrl) {
          return { url: data.existingPrUrl };
        }

        const sections = buildProjectPrSections(
          data.projectTitle,
          data.projectDescription,
          data.completedTasks,
        );
        const evaUrl = buildEvaProjectUrl(
          data.repoOwner,
          data.repoName,
          args.projectId,
          data.rootDirectory || undefined,
        );
        const body = buildPrBody(sections, evaUrl);

        const labels = buildTaskPullRequestLabels({
          rootDirectory: data.rootDirectory,
          isQuickTask: false,
        });

        const prUrl: string = await ctx.runAction(
          internal.taskWorkflowActions.createPullRequest,
          {
            installationId: data.installationId,
            repoOwner: data.repoOwner,
            repoName: data.repoName,
            branchName: data.branchName,
            baseBranch: data.baseBranch,
            title: data.projectTitle,
            body,
            labels,
            draft: false,
          },
        );

        await ctx.runMutation(internal.projects.setProjectPrUrl, {
          projectId: args.projectId,
          prUrl,
        });

        return { url: prUrl };
      }),
      `pr createProjectPr project=${args.projectId}`,
    ),
});

/** Creates a GitHub pull request via the installation Octokit and optionally adds labels. */
export const createPullRequest = internalAction({
  args: {
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    baseBranch: v.optional(v.string()),
    title: v.string(),
    body: v.string(),
    labels: v.array(v.string()),
    draft: v.optional(v.boolean()),
  },
  returns: v.string(),
  handler: async (_ctx, args): Promise<string> => {
    return await createPullRequestWithGitHub(args);
  },
});

export const createTaskPullRequest = internalAction({
  args: {
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    baseBranch: v.optional(v.string()),
    title: v.string(),
    taskId: v.id("agentTasks"),
    projectId: v.optional(v.id("projects")),
    taskDescription: v.optional(v.string()),
    rootDirectory: v.string(),
    changeRequests: v.array(v.string()),
    draft: v.optional(v.boolean()),
  },
  returns: v.string(),
  handler: async (_ctx, args): Promise<string> => {
    const isQuickTask = !args.projectId;
    return await createPullRequestWithGitHub({
      installationId: args.installationId,
      repoOwner: args.repoOwner,
      repoName: args.repoName,
      branchName: args.branchName,
      baseBranch: args.baseBranch,
      title: args.title,
      body: buildTaskPullRequestBody({
        repoOwner: args.repoOwner,
        repoName: args.repoName,
        taskId: args.taskId,
        projectId: args.projectId,
        taskDescription: args.taskDescription,
        rootDirectory: args.rootDirectory,
        changeRequests: args.changeRequests,
      }),
      labels: buildTaskPullRequestLabels({
        rootDirectory: args.rootDirectory,
        isQuickTask,
      }),
      draft: args.draft,
    });
  },
});

export const refreshTaskPullRequestBody = internalAction({
  args: {
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    taskId: v.id("agentTasks"),
    projectId: v.optional(v.id("projects")),
    taskDescription: v.optional(v.string()),
    rootDirectory: v.string(),
    changeRequests: v.array(v.string()),
  },
  returns: v.string(),
  handler: async (_ctx, args): Promise<string> => {
    return await refreshPullRequestBodyWithGitHub({
      installationId: args.installationId,
      repoOwner: args.repoOwner,
      repoName: args.repoName,
      branchName: args.branchName,
      body: buildTaskPullRequestBody({
        repoOwner: args.repoOwner,
        repoName: args.repoName,
        taskId: args.taskId,
        projectId: args.projectId,
        taskDescription: args.taskDescription,
        rootDirectory: args.rootDirectory,
        changeRequests: args.changeRequests,
      }),
    });
  },
});

/**
 * Updates a linked GitHub PR title to `Eva: <title>` after a rename in Eva.
 * Skips merged PRs. Best-effort — failures are logged and never thrown.
 */
export const updatePrTitle = internalAction({
  args: {
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    prUrl: v.string(),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const prNumber = extractPrNumber(args.prUrl);
    if (prNumber === null) return null;
    try {
      const octokit = await getInstallationOctokit(args.installationId);
      const pr = await octokit.rest.pulls.get({
        owner: args.repoOwner,
        repo: args.repoName,
        pull_number: prNumber,
      });
      if (pr.data.merged) return null;
      await octokit.rest.pulls.update({
        owner: args.repoOwner,
        repo: args.repoName,
        pull_number: prNumber,
        title: `Eva: ${args.title}`,
      });
    } catch (error) {
      console.error(
        `[github] Failed to update PR title for ${args.prUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  },
});

/** Converts an open PR back to draft. Uses GraphQL because GitHub's REST
 * pulls.update endpoint does not support flipping draft state. */
export const convertPrToDraft = internalAction({
  args: {
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    prNumber: v.number(),
  },
  returns: v.boolean(),
  handler: async (_ctx, args) => {
    try {
      const octokit = await getInstallationOctokit(args.installationId);
      // Look up the PR's GraphQL node_id (GraphQL mutations need it).
      const { data: pr } = await octokit.rest.pulls.get({
        owner: args.repoOwner,
        repo: args.repoName,
        pull_number: args.prNumber,
      });
      if (pr.draft) return true; // already draft
      await octokit.graphql(
        `mutation($id: ID!) {
          convertPullRequestToDraft(input: { pullRequestId: $id }) {
            pullRequest { isDraft }
          }
        }`,
        { id: pr.node_id },
      );
      console.log(
        `[github] Converted PR #${args.prNumber} back to draft (${args.repoOwner}/${args.repoName})`,
      );
      return true;
    } catch (error) {
      console.error(
        `[github] Failed to convert PR to draft: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  },
});

/** Reopens a closed PR and syncs its draft state. `asReady` true → ready for
 * review, false → draft. No-op if the PR is already merged (can't reopen). */
export const reopenPullRequest = internalAction({
  args: {
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    prNumber: v.number(),
    asReady: v.boolean(),
  },
  returns: v.boolean(),
  handler: async (_ctx, args) => {
    try {
      const octokit = await getInstallationOctokit(args.installationId);
      const { data: initial } = await octokit.rest.pulls.get({
        owner: args.repoOwner,
        repo: args.repoName,
        pull_number: args.prNumber,
      });
      if (initial.merged) {
        console.log(
          `[github] PR #${args.prNumber} is merged — cannot reopen (${args.repoOwner}/${args.repoName})`,
        );
        return false;
      }
      let pr = initial;
      if (pr.state === "closed") {
        const { data: reopened } = await octokit.rest.pulls.update({
          owner: args.repoOwner,
          repo: args.repoName,
          pull_number: args.prNumber,
          state: "open",
        });
        pr = reopened;
        console.log(
          `[github] Reopened PR #${args.prNumber} (${args.repoOwner}/${args.repoName})`,
        );
      }
      // GitHub preserves the previous draft state on reopen, so flip it if the
      // target status doesn't match.
      if (pr.draft && args.asReady) {
        await octokit.graphql(
          `mutation($id: ID!) {
            markPullRequestReadyForReview(input: { pullRequestId: $id }) {
              pullRequest { isDraft }
            }
          }`,
          { id: pr.node_id },
        );
      } else if (!pr.draft && !args.asReady) {
        await octokit.graphql(
          `mutation($id: ID!) {
            convertPullRequestToDraft(input: { pullRequestId: $id }) {
              pullRequest { isDraft }
            }
          }`,
          { id: pr.node_id },
        );
      }
      return true;
    } catch (error) {
      console.error(
        `[github] Failed to reopen PR: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  },
});

/** Closes an open PR on GitHub without merging. No-op if the PR is already
 * closed or merged. */
export const closePullRequest = internalAction({
  args: {
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    prNumber: v.number(),
  },
  returns: v.boolean(),
  handler: async (_ctx, args) => {
    try {
      const octokit = await getInstallationOctokit(args.installationId);
      const { data: pr } = await octokit.rest.pulls.get({
        owner: args.repoOwner,
        repo: args.repoName,
        pull_number: args.prNumber,
      });
      if (pr.state === "closed" || pr.merged) return true;
      await octokit.rest.pulls.update({
        owner: args.repoOwner,
        repo: args.repoName,
        pull_number: args.prNumber,
        state: "closed",
      });
      console.log(
        `[github] Closed PR #${args.prNumber} (${args.repoOwner}/${args.repoName})`,
      );
      return true;
    } catch (error) {
      console.error(
        `[github] Failed to close PR: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  },
});

/** Marks a draft PR as ready for review. Uses GraphQL because GitHub's REST
 * pulls.update endpoint silently ignores the draft field. */
export const markPrReadyForReview = internalAction({
  args: {
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    prNumber: v.number(),
  },
  returns: v.boolean(),
  handler: async (_ctx, args) => {
    try {
      const octokit = await getInstallationOctokit(args.installationId);
      const { data: pr } = await octokit.rest.pulls.get({
        owner: args.repoOwner,
        repo: args.repoName,
        pull_number: args.prNumber,
      });
      if (!pr.draft) return true; // already ready
      await octokit.graphql(
        `mutation($id: ID!) {
          markPullRequestReadyForReview(input: { pullRequestId: $id }) {
            pullRequest { isDraft }
          }
        }`,
        { id: pr.node_id },
      );
      console.log(
        `[github] Marked PR #${args.prNumber} as ready for review (${args.repoOwner}/${args.repoName})`,
      );
      return true;
    } catch (error) {
      console.error(
        `[github] Failed to mark PR ready: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  },
});

/** Updates an existing PR body. */
export const refreshPullRequestBody = internalAction({
  args: {
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    body: v.string(),
  },
  returns: v.string(),
  handler: async (_ctx, args) => {
    return await refreshPullRequestBodyWithGitHub(args);
  },
});

type DeploymentPollArgs = {
  installationId: number;
  repoOwner: string;
  repoName: string;
  repoId: Id<"githubRepos">;
  branchName: string;
  deploymentProjectName?: string;
  attempt: number;
};

/**
 * Shared GitHub poll + retry decision. Callers persist onto the run or
 * session row and schedule the next attempt for their own action.
 */
async function runDeploymentPollAttempt(
  ctx: GenericActionCtx<DataModel>,
  args: DeploymentPollArgs,
  opts: {
    logPrefix: string;
    persistQueued: () => Promise<void>;
    persistStatus: (
      status: DeploymentStatus,
      deploymentUrl: string | undefined,
    ) => Promise<void>;
    reschedule: () => Promise<void>;
  },
): Promise<void> {
  const maybeReschedule = async (): Promise<void> => {
    if (args.attempt < MAX_POLL_ATTEMPTS) await opts.reschedule();
  };

  try {
    const octokit = await getInstallationOctokit(args.installationId);
    const snapshot = await fetchGitHubDeploymentSnapshot({
      repos: octokit.rest.repos,
      owner: args.repoOwner,
      repo: args.repoName,
      branch: args.branchName,
      deploymentProjectName: args.deploymentProjectName,
    });

    if (snapshot.kind === "no_deployments") {
      console.log(
        `${opts.logPrefix} No deployment found for ${args.repoOwner}/${args.repoName} branch=${args.branchName} sha=${snapshot.commitSha} attempt=${args.attempt} project=${args.deploymentProjectName ?? "none"}`,
      );
      await maybeReschedule();
      return;
    }
    if (snapshot.kind === "no_project_match") {
      console.log(
        `${opts.logPrefix} ${snapshot.environments.length} deployment(s) found but none match project=${args.deploymentProjectName}, envs=[${snapshot.environments.join(", ")}], attempt=${args.attempt}`,
      );
      await maybeReschedule();
      return;
    }
    if (snapshot.kind === "no_status") {
      console.log(
        `${opts.logPrefix} Deployment ${snapshot.deploymentId} found but no statuses yet, attempt=${args.attempt} project=${args.deploymentProjectName ?? "none"}`,
      );
      await opts.persistQueued();
      await maybeReschedule();
      return;
    }

    const { url: deploymentUrl, shouldKeepPolling } =
      await resolveStableDeploymentUrl(
        ctx,
        args.repoId,
        snapshot.perCommitUrl,
        args.attempt,
      );
    console.log(
      `${opts.logPrefix} ${args.repoOwner}/${args.repoName} branch=${args.branchName}: deployment=${snapshot.deploymentId} env=${snapshot.environment} state=${snapshot.githubState} mapped=${snapshot.mappedStatus} url=${deploymentUrl ?? "none"} project=${args.deploymentProjectName ?? "none"} keepPolling=${shouldKeepPolling}`,
    );
    await opts.persistStatus(snapshot.mappedStatus, deploymentUrl);
    const shouldReschedule =
      !isTerminalDeploymentStatus(snapshot.mappedStatus) || shouldKeepPolling;
    if (shouldReschedule) await maybeReschedule();
  } catch (error) {
    console.error(
      `${opts.logPrefix} Error for ${args.repoOwner}/${args.repoName} branch=${args.branchName} attempt=${args.attempt}: ${error instanceof Error ? error.message : String(error)}`,
    );
    await maybeReschedule();
  }
}

/** Polls GitHub deployment status for a task run branch, scheduling retries until terminal or max attempts. */
export const pollDeploymentStatus = internalAction({
  args: {
    runId: v.id("agentRuns"),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    repoId: v.id("githubRepos"),
    branchName: v.string(),
    deploymentProjectName: v.optional(v.string()),
    attempt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await runDeploymentPollAttempt(ctx, args, {
      logPrefix: "[deployment-poll]",
      persistQueued: async () => {
        await ctx.runMutation(internal.agentRuns.updateDeploymentStatus, {
          runId: args.runId,
          deploymentStatus: "queued",
        });
      },
      persistStatus: async (deploymentStatus, deploymentUrl) => {
        await ctx.runMutation(internal.agentRuns.updateDeploymentStatus, {
          runId: args.runId,
          deploymentStatus,
          deploymentUrl,
        });
      },
      reschedule: async () => {
        await ctx.scheduler.runAfter(
          POLL_INTERVAL_MS,
          internal.taskWorkflowActions.pollDeploymentStatus,
          { ...args, attempt: args.attempt + 1 },
        );
      },
    });
    return null;
  },
});

/** Polls GitHub deployment status for a session branch, scheduling retries until terminal or max attempts. */
export const pollSessionDeploymentStatus = internalAction({
  args: {
    sessionId: v.id("sessions"),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    repoId: v.id("githubRepos"),
    branchName: v.string(),
    deploymentProjectName: v.optional(v.string()),
    attempt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await runDeploymentPollAttempt(ctx, args, {
      logPrefix: "[session-deployment-poll]",
      persistQueued: async () => {
        await ctx.runMutation(internal.sessions.updateDeploymentStatus, {
          sessionId: args.sessionId,
          deploymentStatus: "queued",
        });
      },
      persistStatus: async (deploymentStatus, deploymentUrl) => {
        await ctx.runMutation(internal.sessions.updateDeploymentStatus, {
          sessionId: args.sessionId,
          deploymentStatus,
          deploymentUrl,
        });
      },
      reschedule: async () => {
        await ctx.scheduler.runAfter(
          POLL_INTERVAL_MS,
          internal.taskWorkflowActions.pollSessionDeploymentStatus,
          { ...args, attempt: args.attempt + 1 },
        );
      },
    });
    return null;
  },
});
