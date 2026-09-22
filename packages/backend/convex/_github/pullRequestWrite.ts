"use node";

import { Effect } from "effect";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { getInstallationOctokit } from "../githubAuth";
import { retryAfterDelays, runPromiseRethrowing } from "../_effect/retry";
import {
  GitHubBranchNotAhead,
  githubRequest,
  originalGitHubError,
} from "./githubErrors";

/** Waits between the seven compare attempts, so six gaps. */
const PR_READY_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 12000, 16000];

type InstallationOctokit = Awaited<ReturnType<typeof getInstallationOctokit>>;

export type PullRequestWriteTarget = {
  installationId: number;
  repoOwner: string;
  repoName: string;
  branchName: string;
};

export type PullRequestCreateParams = PullRequestWriteTarget & {
  baseBranch?: string;
  title: string;
  body: string;
  labels: string[];
  draft?: boolean;
};

export type PullRequestRefreshParams = PullRequestWriteTarget & {
  body: string;
};

export type OpenPullRequestRef = {
  url: string;
  number: number;
  body: string | null;
};

/**
 * A PR eva just created carries its number so labels can be added. One adopted
 * after losing a create race does not: it already has the labels its own
 * creation applied.
 */
type PullRequestOutcome = { url: string; createdNumber?: number };

export async function findOpenPullRequestForBranch(
  params: PullRequestWriteTarget,
): Promise<OpenPullRequestRef | null> {
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

export async function waitForPullRequestHead(params: {
  octokit: InstallationOctokit;
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

export async function createPullRequestWithGitHub(
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

export async function refreshPullRequestBodyWithGitHub(
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

export async function getPullRequest(
  octokit: InstallationOctokit,
  target: { owner: string; repo: string; pull_number: number },
) {
  const { data } = await octokit.rest.pulls.get(target);
  return data;
}

export async function patchPullRequest(
  octokit: InstallationOctokit,
  target: { owner: string; repo: string; pull_number: number },
  patch: {
    title?: string;
    body?: string;
    state?: "open" | "closed";
    base?: string;
  },
) {
  const { data } = await octokit.rest.pulls.update({ ...target, ...patch });
  return data;
}
