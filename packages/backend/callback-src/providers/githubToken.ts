import { CONVEX_TOKEN, CONVEX_URL, REPO_ID } from "../config.js";
import { fetchWithTimeout } from "../http/convexClient.js";
import type { JsonValue } from "../types.js";
import { readResponseJson } from "../utils.js";

export type GithubTokenFetch = (
  url: string,
  options: RequestInit,
) => Promise<Response>;

export type GithubTokenEnv = {
  GITHUB_TOKEN?: string;
  GH_TOKEN?: string;
};

/** Pulls `data.value.token` out of a Convex action JSON envelope. */
export function tokenFromActionResponse(data: JsonValue | null): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const value = data.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return typeof value.token === "string" ? value.token : null;
}

/**
 * Fetches a GitHub App installation token from Convex. Best-effort: network
 * or parse failures return `{ token: null }` so git can keep using whatever
 * is already in the environment.
 */
export async function fetchInstallationToken(params: {
  convexUrl: string;
  convexToken: string;
  repoId: string;
  fetchFn?: GithubTokenFetch;
}): Promise<{ token: string } | { token: null }> {
  try {
    const fetchFn = params.fetchFn ?? fetchWithTimeout;
    const response = await fetchFn(params.convexUrl + "/api/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + params.convexToken,
      },
      body: JSON.stringify({
        path: "github:getInstallationTokenAction",
        args: { repoId: params.repoId },
        format: "json",
      }),
    });
    if (!response.ok) return { token: null };
    const token = tokenFromActionResponse(await readResponseJson(response));
    return token ? { token } : { token: null };
  } catch {
    return { token: null };
  }
}

/** Writes the token into the env object the credential helper / `gh` read. */
export function applyGithubTokenToEnv(
  env: GithubTokenEnv,
  token: string,
): void {
  env.GITHUB_TOKEN = token;
  env.GH_TOKEN = token;
}

/**
 * Refreshes `GITHUB_TOKEN` / `GH_TOKEN` when Convex credentials are present.
 * Callers decide *when*; this owns the HTTP + env write.
 */
export async function ensureGithubToken(params: {
  convexUrl: string | undefined;
  convexToken: string | undefined;
  repoId: string | undefined;
  env?: GithubTokenEnv;
  fetchFn?: GithubTokenFetch;
}): Promise<{ refreshed: boolean }> {
  const convexUrl = params.convexUrl;
  const convexToken = params.convexToken;
  const repoId = params.repoId;
  if (!convexUrl || !convexToken || !repoId) {
    return { refreshed: false };
  }
  const result = await fetchInstallationToken({
    convexUrl,
    convexToken,
    repoId,
    fetchFn: params.fetchFn,
  });
  if (result.token === null) return { refreshed: false };
  applyGithubTokenToEnv(params.env ?? process.env, result.token);
  return { refreshed: true };
}

/** Refreshes the in-sandbox GitHub token from the daemon's Convex env. */
export async function refreshDaemonGithubTokenFromEnv(): Promise<{
  refreshed: boolean;
}> {
  return ensureGithubToken({
    convexUrl: CONVEX_URL,
    convexToken: CONVEX_TOKEN,
    repoId: REPO_ID,
  });
}
