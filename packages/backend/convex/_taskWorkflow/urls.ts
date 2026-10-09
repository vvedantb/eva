import { getEvaBaseUrl } from "../_env/webAppUrl";

function repoPath(repoName: string, rootDirectory?: string): string {
  if (!rootDirectory) return repoName;
  const appName = rootDirectory.split("/").pop();
  if (!appName) return repoName;
  return `${repoName}/${appName}`;
}

/** Builds a link to view a task in the Eva web app. */
export function buildEvaTaskUrl(
  repoOwner: string,
  repoName: string,
  taskId: string,
  projectId?: string,
  rootDirectory?: string,
): string {
  const segment = repoPath(repoName, rootDirectory);
  const baseUrl = getEvaBaseUrl();
  if (projectId) {
    return `${baseUrl}/${repoOwner}/${segment}/projects/${projectId}`;
  }
  return `${baseUrl}/${repoOwner}/${segment}/quick-tasks/${taskId}`;
}

/** Builds a link to view a session in the Eva web app. */
export function buildEvaSessionUrl(
  repoOwner: string,
  repoName: string,
  sessionId: string,
  rootDirectory?: string,
): string {
  const segment = repoPath(repoName, rootDirectory);
  return `${getEvaBaseUrl()}/${repoOwner}/${segment}/sessions/${sessionId}`;
}

/** Builds a link to view a project in the Eva web app. */
export function buildEvaProjectUrl(
  repoOwner: string,
  repoName: string,
  projectId: string,
  rootDirectory?: string,
): string {
  const segment = repoPath(repoName, rootDirectory);
  return `${getEvaBaseUrl()}/${repoOwner}/${segment}/projects/${projectId}`;
}

/** Builds a link to view a doc in the Eva web app (path uses per-repo numId). */
export function buildEvaDocUrl(
  repoOwner: string,
  repoName: string,
  docNumId: number,
  docTab:
    | "content"
    | "html"
    | "description"
    | "requirements"
    | "user-flows" = "content",
  rootDirectory?: string,
): string {
  const segment = repoPath(repoName, rootDirectory);
  return `${getEvaBaseUrl()}/${repoOwner}/${segment}/docs/${docNumId}/${docTab}`;
}

/** Builds a link to a PR under Reviews (keyed by GitHub PR number). */
export function buildEvaReviewUrl(
  repoOwner: string,
  repoName: string,
  prNumber: number,
  reviewTab: "overview" | "recap" | "diff" = "recap",
  rootDirectory?: string,
): string {
  const segment = repoPath(repoName, rootDirectory);
  return `${getEvaBaseUrl()}/${repoOwner}/${segment}/reviews/${prNumber}/${reviewTab}`;
}
