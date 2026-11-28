import { CONVEX_TOKEN, CONVEX_URL, REPO_ID } from "../config.js";
import { fetchWithTimeout } from "../http/convexClient.js";
import type { JsonValue } from "../types.js";
import { isJsonObject, readResponseJson } from "../utils.js";

function tokenFromActionResponse(data: JsonValue | null): string | null {
  if (!isJsonObject(data)) {
    return null;
  }
  const value = data.value;
  if (!isJsonObject(value)) {
    return null;
  }
  return typeof value.token === "string" ? value.token : null;
}

async function fetchInstallationToken(params: {
  convexUrl: string;
  convexToken: string;
  repoId: string;
}): Promise<{ token: string } | { token: null }> {
  try {
    const response = await fetchWithTimeout(params.convexUrl + "/api/action", {
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

function applyGithubTokenToEnv(token: string): void {
  process.env.GITHUB_TOKEN = token;
  process.env.GH_TOKEN = token;
}

/**
 * Refreshes `GITHUB_TOKEN` / `GH_TOKEN` when Convex credentials are present.
 * Callers decide *when*; this owns the HTTP + env write.
 */
export async function ensureGithubToken(params: {
  convexUrl: string | undefined;
  convexToken: string | undefined;
  repoId: string | undefined;
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
  });
  if (result.token === null) return { refreshed: false };
  applyGithubTokenToEnv(result.token);
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
