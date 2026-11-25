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
 * Whether the Convex client holds a Clerk token. Route loaders run as soon as
 * Clerk reports a session, before `ConvexProviderWithClerk` gives Convex the
 * token; a prefetch in that gap reaches the backend signed out and fails with
 * "Not authenticated". Written by `TrackConvexAuth` in `ClientProvider`.
 */
let convexAuthenticated = false;

export function setConvexAuthenticated(value: boolean) {
  convexAuthenticated = value;
}

/**
 * Warms one query in the Convex client cache for a route about to open.
 * Args must match the page's own subscription exactly, or the warm result
 * sits under a different key. Skipped until Convex is authenticated.
 */
export function prewarm<Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query>,
) {
  if (!convexAuthenticated) return;
  convex.prewarmQuery({ query, args, extendSubscriptionFor: PREFETCH_HOLD_MS });
}

/**
 * The repo a `/$owner/$repo/…` route param pair names, or null — also null
 * before Convex is authenticated, so the page loads the normal way.
 */
export async function prefetchRepo(params: { owner: string; repo: string }) {
  if (!convexAuthenticated) return null;
  const { name, appName } = decodeRepoParam(params.repo);
  return convex.query(api.githubRepos.getByOwnerAndName, {
    owner: params.owner,
    name,
    appName,
  });
}
