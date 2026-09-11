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
  created_at?: string;
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

/** Latest status row for one deployment, or null when GitHub has none yet. */
export async function fetchLatestDeploymentStatus(params: {
  repos: Pick<GitHubReposDeploymentApi, "listDeploymentStatuses">;
  owner: string;
  repo: string;
  deploymentId: number;
}): Promise<DeploymentStatusItem | null> {
  const { data: statuses } = await params.repos.listDeploymentStatuses({
    owner: params.owner,
    repo: params.repo,
    deployment_id: params.deploymentId,
    per_page: 1,
  });
  return statuses[0] ?? null;
}

export type GitHubDeploymentSnapshot =
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
  const { data: branch } = await params.repos.getBranch({
    owner: params.owner,
    repo: params.repo,
    branch: params.branch,
  });
  const commitSha = branch.commit.sha;

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

  const latestStatus = await fetchLatestDeploymentStatus({
    repos: params.repos,
    owner: params.owner,
    repo: params.repo,
    deploymentId: targetDeployment.id,
  });

  if (latestStatus === null) {
    return {
      kind: "no_status",
      commitSha,
      deploymentId: targetDeployment.id,
      environment: targetDeployment.environment,
    };
  }

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
