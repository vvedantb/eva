"use node";

import { z } from "zod";
import { errorText } from "../_shared/errors";

// Thin wrapper around Vercel's "Get a Deployment by ID or URL" REST endpoint.
// We call this after we already know the per-commit deployment URL (from GitHub
// Deployment Statuses). The goal is to pick up the stable branch alias Vercel
// auto-assigns — e.g. `my-app-git-feature-foo-acme.vercel.app` — because that
// URL persists across commits on the same PR, whereas the per-commit URL goes
// stale the moment a new push builds.
//
// We deliberately never construct the alias ourselves: when the subdomain
// exceeds the 63-char DNS label limit, Vercel truncates + appends a
// non-deterministic hash. Reading the alias back from Vercel is the only
// way to get the exact hashed form.

/** Strips protocol and trailing slashes from a Vercel deployment URL. */
function toHostname(urlOrHostname: string): string {
  return urlOrHostname.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/** Vercel response shape. We only need `alias`, which is optional. */
const vercelDeploymentResponseSchema = z.object({
  alias: z.array(z.string()).optional(),
});

/**
 * Fetches the stable `-git-` branch alias for a Vercel deployment, identified
 * by its per-commit hostname. Returns null on any failure (missing token, HTTP
 * error, malformed payload, or no branch alias attached yet) so callers can
 * fall back to the per-commit URL without special-casing errors.
 */
export async function fetchStableBranchAlias(args: {
  perCommitHostname: string;
  token: string;
  teamId: string | undefined;
}): Promise<string | null> {
  if (!args.token) return null;
  const hostname = toHostname(args.perCommitHostname);
  if (!hostname) return null;

  const params = new URLSearchParams();
  if (args.teamId) params.set("teamId", args.teamId);
  const qs = params.toString();
  const url = `https://api.vercel.com/v13/deployments/${encodeURIComponent(hostname)}${qs ? `?${qs}` : ""}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${args.token}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      console.log(
        `[vercel-alias] Non-OK response for ${hostname}: ${response.status} ${response.statusText}`,
      );
      return null;
    }
    const payload: unknown = await response.json();
    const parsed = vercelDeploymentResponseSchema.safeParse(payload);
    if (!parsed.success) {
      console.log(`[vercel-alias] Unexpected response shape for ${hostname}`);
      return null;
    }
    const aliases = parsed.data.alias ?? [];
    // Match Vercel's branch alias pattern: `<project>-git-<branch>-<team>.vercel.app`.
    // The `-git-` marker uniquely identifies auto-generated branch aliases and
    // excludes custom domains and the per-commit hash alias.
    const branchAlias = aliases.find((entry) =>
      /-git-[^.]+\.vercel\.app$/.test(entry),
    );
    return branchAlias ?? null;
  } catch (error) {
    console.log(
      `[vercel-alias] Fetch failed for ${hostname}: ${errorText(error)}`,
    );
    return null;
  }
}
