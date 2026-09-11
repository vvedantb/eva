"use node";

import {
  mapGitHubDeploymentState,
  type DeploymentStatus,
} from "../_taskWorkflow/deploymentHelpers";

export type DeploymentListItem = {
  id: number;
  environment: string;
};

export type DeploymentStatusItem = {
  state: string;
  environment_url?: string | null;
  target_url?: string | null;
};

/** Narrow Octokit `rest.repos` surface used by deployment polling. */
export type GitHubReposDeploymentApi = {
  getBranch: (args: {
    owner: string;
    repo: string;
    branch: string;
  }) => Promise<{ data: { commit: { sha: string } } }>;
  listDeployments: (args: {
    owner: string;
    repo: string;
    sha: string;
    per_page: number;
  }) => Promise<{ data: DeploymentListItem[] }>;
  listDeploymentStatuses: (args: {
    owner: string;
    repo: string;
    deployment_id: number;
    per_page: number;
  }) => Promise<{ data: DeploymentStatusItem[] }>;
};

export type GitHubDeploymentSnapshot =
  | { kind: "missing_branch" }
  | { kind: "no_deployments"; commitSha: string }
  | { kind: "no_project_match"; commitSha: string; environments: string[] }
  | {
      kind: "no_status";
      commitSha: string;
      deploymentId: number;
      environment: string;
    }
  | {
      kind: "status";
      commitSha: string;
      deploymentId: number;
      environment: string;
      githubState: string;
      mappedStatus: DeploymentStatus;
      perCommitUrl: string | undefined;
    };

/**
 * Prod (2026-09-11): `pollSessionDeploymentStatus` logged ERROR for GitHub
 * `Branch not found` while retrying session branches that were not pushed yet
 * or had already been deleted. That is an expected poll miss.
 */
export function isMissingGithubBranchError(error: Error): boolean {
  return error.message.toLowerCase().includes("branch not found");
}

/**
 * One GitHub read for a branch's latest deployment. Callers own persist,
 * URL alias resolution, and retry scheduling.
 */
export async function fetchGitHubDeploymentSnapshot(params: {
  repos: GitHubReposDeploymentApi;
  owner: string;
  repo: string;
  branch: string;
  deploymentProjectName?: string;
}): Promise<GitHubDeploymentSnapshot> {
  let commitSha: string;
  try {
    const { data: branch } = await params.repos.getBranch({
      owner: params.owner,
      repo: params.repo,
      branch: params.branch,
    });
    commitSha = branch.commit.sha;
  } catch (error) {
    if (error instanceof Error && isMissingGithubBranchError(error)) {
      return { kind: "missing_branch" };
    }
    throw error;
  }

  const { data: deployments } = await params.repos.listDeployments({
    owner: params.owner,
    repo: params.repo,
    sha: commitSha,
    per_page: 10,
  });

  if (deployments.length === 0) {
    return { kind: "no_deployments", commitSha };
  }

  const projectNameLower = params.deploymentProjectName?.toLowerCase();
  const matchedDeployment = projectNameLower
    ? deployments.find((deployment) =>
        deployment.environment.toLowerCase().includes(projectNameLower),
      )
    : undefined;
  const targetDeployment = matchedDeployment ?? deployments[0];

  if (projectNameLower && !matchedDeployment) {
    return {
      kind: "no_project_match",
      commitSha,
      environments: deployments.map((deployment) => deployment.environment),
    };
  }

  if (targetDeployment === undefined) {
    return { kind: "no_deployments", commitSha };
  }

  const { data: statuses } = await params.repos.listDeploymentStatuses({
    owner: params.owner,
    repo: params.repo,
    deployment_id: targetDeployment.id,
    per_page: 1,
  });

  if (statuses.length === 0) {
    return {
      kind: "no_status",
      commitSha,
      deploymentId: targetDeployment.id,
      environment: targetDeployment.environment,
    };
  }

  const latestStatus = statuses[0];
  const perCommitUrl =
    latestStatus.environment_url || latestStatus.target_url || undefined;
  return {
    kind: "status",
    commitSha,
    deploymentId: targetDeployment.id,
    environment: targetDeployment.environment,
    githubState: latestStatus.state,
    mappedStatus: mapGitHubDeploymentState(latestStatus.state),
    perCommitUrl,
  };
}
