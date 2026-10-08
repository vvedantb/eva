"use node";

import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { getInstallationOctokit } from "../githubAuth";
import { isPullRequestAlreadyExistsError } from "./prErrors";

const PR_READY_WAIT_DELAYS_MS = [0, 1000, 2000, 4000, 8000, 12000, 16000];

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
  for (const delayMs of PR_READY_WAIT_DELAYS_MS) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    try {
      const comparison =
        await params.octokit.rest.repos.compareCommitsWithBasehead({
          owner: params.repoOwner,
          repo: params.repoName,
          basehead: `${params.baseBranch}...${params.branchName}`,
          per_page: 1,
        });
      if (comparison.data.ahead_by > 0) {
        return;
      }
      // Compare succeeded: GitHub sees both tips and head is not ahead.
      // Retrying won't create commits — fail immediately (plan-only turns).
      throw new Error(
        `${params.branchName} is not ahead of ${params.baseBranch}: every commit on it is already in ${params.baseBranch}, or the run committed locally and its push to GitHub failed`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("is not ahead of")) {
        throw error;
      }
      // Branch may not be visible yet right after push — keep retrying.
      lastError =
        error instanceof Error ? error.message : "GitHub compare failed";
    }
  }
  throw new Error(
    `GitHub did not report ${params.branchName} as ready for a pull request after branch push: ${lastError}`,
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

  let prNumber: number;
  let prUrl: string;
  try {
    const pr = await octokit.rest.pulls.create({
      owner: args.repoOwner,
      repo: args.repoName,
      title: `Eva: ${args.title}`,
      body: args.body,
      head: args.branchName,
      base: baseBranch,
      draft: args.draft ?? false,
    });
    prNumber = pr.data.number;
    prUrl = pr.data.html_url;
  } catch (error) {
    // Concurrent create or list lag: adopt the existing PR instead of failing.
    if (isPullRequestAlreadyExistsError(error)) {
      for (const delayMs of [0, 1000, 2000]) {
        if (delayMs > 0) {
          await sleep(delayMs);
        }
        const raced = await findOpenPullRequestForBranch(args);
        if (raced) {
          return raced.url;
        }
      }
    }
    throw error;
  }

  if (args.labels.length > 0) {
    try {
      await octokit.rest.issues.addLabels({
        owner: args.repoOwner,
        repo: args.repoName,
        issue_number: prNumber,
        labels: args.labels,
      });
    } catch (labelError) {
      console.error(
        `Failed to add labels to PR ${prUrl}: ${labelError instanceof Error ? labelError.message : String(labelError)}`,
      );
    }
  }

  return prUrl;
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
