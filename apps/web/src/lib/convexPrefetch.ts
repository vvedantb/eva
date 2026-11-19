import { api } from "@eva/backend";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { convex } from "@/lib/convex";
import { decodeRepoParam } from "@/lib/utils/repoUrl";

/**
 * How long a prefetched subscription outlives the hover that started it. Long
 * enough to cover a slow click; short enough that sweeping the pointer down
 * the sidebar does not keep dozens of results live.
 */
const PREFETCH_HOLD_MS = 30_000;

/**
 * Warms one query in the Convex client cache for a route about to open.
 * Args must match the page's own subscription exactly, or the warm result
 * sits under a different key.
 */
export function prewarm<Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query>,
) {
  convex.prewarmQuery({ query, args, extendSubscriptionFor: PREFETCH_HOLD_MS });
}

/** The repo a `/$owner/$repo/…` route param pair names, or null. */
export async function prefetchRepo(params: { owner: string; repo: string }) {
  const { name, appName } = decodeRepoParam(params.repo);
  return convex.query(api.githubRepos.getByOwnerAndName, {
    owner: params.owner,
    name,
    appName,
  });
}
