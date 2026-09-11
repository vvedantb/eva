import { describe, expect, test } from "vitest";
import {
  fetchGitHubDeploymentSnapshot,
  isMissingGithubBranchError,
  type GitHubReposDeploymentApi,
} from "../convex/_github/deploymentSnapshot";

function reposApi(opts: {
  sha?: string;
  deployments?: Array<{ id: number; environment: string }>;
  statuses?: Array<{
    state: string;
    environment_url?: string | null;
    target_url?: string | null;
  }>;
}): GitHubReposDeploymentApi {
  return {
    getBranch: async () => ({
      data: { commit: { sha: opts.sha ?? "abc123" } },
    }),
    listDeployments: async () => ({
      data: opts.deployments ?? [],
    }),
    listDeploymentStatuses: async () => ({
      data: opts.statuses ?? [],
    }),
  };
}

const base = {
  owner: "acme",
  repo: "eva",
  branch: "eva/session-1",
};

describe("fetchGitHubDeploymentSnapshot", () => {
  test("no deployments on the branch SHA", async () => {
    const snapshot = await fetchGitHubDeploymentSnapshot({
      ...base,
      repos: reposApi({ deployments: [] }),
    });
    expect(snapshot).toEqual({ kind: "no_deployments", commitSha: "abc123" });
  });

  test("keeps polling when a project filter matches nothing", async () => {
    const snapshot = await fetchGitHubDeploymentSnapshot({
      ...base,
      deploymentProjectName: "web",
      repos: reposApi({
        deployments: [{ id: 9, environment: "Production – api" }],
      }),
    });
    expect(snapshot.kind).toBe("no_project_match");
    if (snapshot.kind === "no_project_match") {
      expect(snapshot.environments).toEqual(["Production – api"]);
    }
  });

  test("reports a deployment with no statuses yet", async () => {
    const snapshot = await fetchGitHubDeploymentSnapshot({
      ...base,
      repos: reposApi({
        deployments: [{ id: 4, environment: "Preview" }],
        statuses: [],
      }),
    });
    expect(snapshot).toEqual({
      kind: "no_status",
      commitSha: "abc123",
      deploymentId: 4,
      environment: "Preview",
    });
  });

  test("missing GitHub branch is a handled snapshot, not a throw", async () => {
    const axiomFingerprint =
      "Branch not found - https://docs.github.com/rest/branches/branches#get-a-branch";
    expect(isMissingGithubBranchError(new Error(axiomFingerprint))).toBe(true);
    expect(isMissingGithubBranchError(new Error("API rate limit exceeded"))).toBe(
      false,
    );

    const snapshot = await fetchGitHubDeploymentSnapshot({
      ...base,
      repos: {
        getBranch: async () => {
          throw new Error(axiomFingerprint);
        },
        listDeployments: async () => ({ data: [] }),
        listDeploymentStatuses: async () => ({ data: [] }),
      },
    });
    expect(snapshot).toEqual({ kind: "missing_branch" });
  });

  test("maps a successful status and prefers environment_url", async () => {
    const snapshot = await fetchGitHubDeploymentSnapshot({
      ...base,
      repos: reposApi({
        deployments: [{ id: 4, environment: "Preview" }],
        statuses: [
          {
            state: "success",
            environment_url: "https://preview.example",
            target_url: "https://ignored",
          },
        ],
      }),
    });
    expect(snapshot).toEqual({
      kind: "status",
      commitSha: "abc123",
      deploymentId: 4,
      environment: "Preview",
      githubState: "success",
      mappedStatus: "deployed",
      perCommitUrl: "https://preview.example",
    });
  });
});
