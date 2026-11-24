import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Old repo-scoped project URLs (`/$owner/$repo/projects/<numId>/…`, task view
 * and tab sub-routes included) moved to the root: `/projects/$owner/$repo/…`.
 */
export const Route = createFileRoute("/_repo/$owner/$repo/projects/$")({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      href: `/projects/${params.owner}/${params.repo}/${params._splat ?? ""}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`,
      replace: true,
    });
  },
});
