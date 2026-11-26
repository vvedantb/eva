"use node";

import type { GenericActionCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { type deploymentStatusValidator } from "../validators";
import { resolveAllEnvVars } from "../envVarResolver";
import { fetchStableBranchAlias } from "../_deployment/vercel";

export const MAX_POLL_ATTEMPTS = 20;
export const POLL_INTERVAL_MS = 30_000;

export type DeploymentStatus = typeof deploymentStatusValidator.type;

/** Maps a GitHub deployment state string to the internal DeploymentStatus enum. */
export function mapGitHubDeploymentState(state: string): DeploymentStatus {
  switch (state) {
    case "queued":
      return "queued";
    case "pending":
    case "in_progress":
    case "waiting":
      return "building";
    case "success":
      return "deployed";
    case "error":
    case "failure":
    case "inactive":
      return "error";
    default:
      return "building";
  }
}

/** Checks whether a deployment status is a final state (deployed or error). */
export function isTerminalDeploymentStatus(status: DeploymentStatus): boolean {
  return status === "deployed" || status === "error";
}

/**
 * Resolves the deployment URL to store, preferring Vercel's stable branch
 * alias over the per-commit URL GitHub reports. Never flips a stored URL:
 * while the alias isn't attached yet we return `undefined` (the mutation
 * leaves the field untouched, since it spreads `deploymentUrl` only when
 * not undefined) and signal the caller to keep polling. On the final
 * attempt we fall back to the per-commit URL as a safety net so the UI
 * isn't permanently empty. If the token isn't configured we degrade to the
 * per-commit URL immediately — same behaviour as before this change.
 */
export async function resolveStableDeploymentUrl(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
  perCommitUrl: string | undefined,
  attempt: number,
): Promise<{ url: string | undefined; shouldKeepPolling: boolean }> {
  if (!perCommitUrl) return { url: undefined, shouldKeepPolling: false };

  const envVars = await resolveAllEnvVars(ctx, repoId);
  const token = envVars.VERCEL_TOKEN;
  if (!token) {
    // No token configured → fall back to today's behaviour immediately.
    return { url: perCommitUrl, shouldKeepPolling: false };
  }
  const teamId = envVars.VERCEL_TEAM_ID;

  const alias = await fetchStableBranchAlias({
    perCommitHostname: perCommitUrl,
    token,
    teamId,
  });
  if (alias) {
    // Vercel's API returns aliases as bare hostnames (e.g. `my-app-git-feat-team.vercel.app`).
    // Prepend `https://` so the stored URL is absolute — without a scheme, browsers treat
    // it as a relative path and prepend the current page's origin when rendered in `<a href>`.
    return { url: `https://${alias}`, shouldKeepPolling: false };
  }

  // Alias not yet attached. Keep polling but DO NOT touch the stored URL —
  // returning `undefined` makes the mutation skip the `deploymentUrl` patch,
  // so users never see a per-commit URL briefly before it flips to the
  // stable alias. On the final attempt we accept the per-commit URL as a
  // safety net so the preview button isn't empty forever.
  if (attempt < MAX_POLL_ATTEMPTS - 1) {
    return { url: undefined, shouldKeepPolling: true };
  }
  return { url: perCommitUrl, shouldKeepPolling: false };
}
