import { ENTITY_SECTION, repoBasePath } from "@eva/shared";
import { requiredEnvUrl } from "@vvedantb/server";

/** Eva web app origin, no trailing slash. Throws when WEB_APP_URL is unset. */
export function getEvaBaseUrl(): string {
  return requiredEnvUrl("WEB_APP_URL");
}

/** Eva web app origin, no trailing slash, or null when WEB_APP_URL is unset. */
export function tryGetEvaBaseUrl(): string | null {
  const url = process.env.WEB_APP_URL;
  return url ? url.replace(/\/$/, "") : null;
}

/** Absolute web URL of a repo: Eva's base URL plus `repoBasePath`. */
function repoUrl(owner: string, name: string, rootDirectory?: string): string {
  return `${getEvaBaseUrl()}${repoBasePath({ owner, name, rootDirectory })}`;
}

/** Builds a link to view a task in the Eva web app. */
export function buildEvaTaskUrl(
  repoOwner: string,
  repoName: string,
  taskId: string,
  projectId?: string,
  rootDirectory?: string,
): string {
  const base = repoUrl(repoOwner, repoName, rootDirectory);
  if (projectId) return `${base}/${ENTITY_SECTION.project}/${projectId}`;
  return `${base}/${ENTITY_SECTION.task}/${taskId}`;
}

/** Builds a link to view a session in the Eva web app. */
export function buildEvaSessionUrl(
  repoOwner: string,
  repoName: string,
  sessionId: string,
  rootDirectory?: string,
): string {
  return `${repoUrl(repoOwner, repoName, rootDirectory)}/${ENTITY_SECTION.session}/${sessionId}`;
}

/** Builds a link to view a project in the Eva web app. */
export function buildEvaProjectUrl(
  repoOwner: string,
  repoName: string,
  projectId: string,
  rootDirectory?: string,
): string {
  return `${repoUrl(repoOwner, repoName, rootDirectory)}/${ENTITY_SECTION.project}/${projectId}`;
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
  return `${repoUrl(repoOwner, repoName, rootDirectory)}/docs/${docNumId}/${docTab}`;
}

/** Builds a link to a doc's Testing Arena tab (path uses per-repo numId). */
export function buildEvaArenaUrl(
  repoOwner: string,
  repoName: string,
  docNumId: number,
  arenaTab: "code" | "browser",
  rootDirectory?: string,
): string {
  return `${repoUrl(repoOwner, repoName, rootDirectory)}/testing-arena/${docNumId}/${arenaTab}`;
}

/** Builds a link to an automation's tab (path uses per-repo numId). */
export function buildEvaAutomationUrl(
  repoOwner: string,
  repoName: string,
  automationNumId: number,
  automationTab: "latest" | "run-history" | "settings",
  rootDirectory?: string,
): string {
  return `${repoUrl(repoOwner, repoName, rootDirectory)}/automations/${automationNumId}/${automationTab}`;
}

/** Builds a link to a PR under Reviews (keyed by GitHub PR number). */
export function buildEvaReviewUrl(
  repoOwner: string,
  repoName: string,
  prNumber: number,
  reviewTab: "overview" | "recap" | "diff" = "recap",
  rootDirectory?: string,
): string {
  return `${repoUrl(repoOwner, repoName, rootDirectory)}/reviews/${prNumber}/${reviewTab}`;
}
