import { createFileRoute } from "@tanstack/react-router";
import { prefetchSession } from "../_utils/prefetchSession";

/**
 * Param + beforeLoad host for `/sessions/$numId/…`. The session shell is
 * rendered by the parent `sessions` layout (`CachedSessionShell`) so Preview
 * survives switching between sessions.
 *
 * The loader only warms the Convex cache — it runs on link hover through the
 * router's intent preload — and never blocks the navigation on it.
 */
export const Route = createFileRoute("/_repo/$owner/$repo/sessions/$numId")({
  loader: ({ params }) => {
    void prefetchSession(params).catch(() => undefined);
  },
  component: () => null,
});
