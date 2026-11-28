"use node";

import { z } from "zod";
import { errorMessage } from "@vvedantb/server";

function toHostname(urlOrHostname: string): string {
  return urlOrHostname.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

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
    const branchAlias = aliases.find((entry) =>
      /-git-[^.]+\.vercel\.app$/.test(entry),
    );
    return branchAlias ?? null;
  } catch (error) {
    console.log(
      `[vercel-alias] Fetch failed for ${hostname}: ${errorMessage(error)}`,
    );
    return null;
  }
}
