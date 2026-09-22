"use node";

import type { getInstallationOctokit } from "../githubAuth";

type InstallationOctokit = Awaited<ReturnType<typeof getInstallationOctokit>>;

export type PullRequestTarget = {
  owner: string;
  repo: string;
  pull_number: number;
};

const CONVERT_TO_DRAFT_MUTATION = `mutation($id: ID!) {
  convertPullRequestToDraft(input: { pullRequestId: $id }) {
    pullRequest { isDraft }
  }
}`;

const MARK_READY_MUTATION = `mutation($id: ID!) {
  markPullRequestReadyForReview(input: { pullRequestId: $id }) {
    pullRequest { isDraft }
  }
}`;

/** Converts an open PR to draft via GraphQL (REST ignores the draft field). */
export async function convertPullRequestToDraft(
  octokit: InstallationOctokit,
  nodeId: string,
): Promise<void> {
  await octokit.graphql(CONVERT_TO_DRAFT_MUTATION, { id: nodeId });
}

/** Marks a draft PR ready for review via GraphQL. */
export async function markPullRequestReadyForReview(
  octokit: InstallationOctokit,
  nodeId: string,
): Promise<void> {
  await octokit.graphql(MARK_READY_MUTATION, { id: nodeId });
}

/**
 * Flips draft state only when it does not already match `asReady`.
 * GitHub preserves draft-ness across reopen, so callers reuse this after
 * `pulls.update({ state: "open" })`.
 */
export async function syncPullRequestDraftState(
  octokit: InstallationOctokit,
  pr: { draft?: boolean | null; node_id: string },
  asReady: boolean,
): Promise<void> {
  if (pr.draft && asReady) {
    await markPullRequestReadyForReview(octokit, pr.node_id);
    return;
  }
  if (!pr.draft && !asReady) {
    await convertPullRequestToDraft(octokit, pr.node_id);
  }
}
