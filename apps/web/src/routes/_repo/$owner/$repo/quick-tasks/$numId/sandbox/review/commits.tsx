import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy review tab, folded into Timeline when the tabs became three. */
export const Route = createFileRoute(
  "/_repo/$owner/$repo/quick-tasks/$numId/sandbox/review/commits",
)({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/$owner/$repo/quick-tasks/$numId/sandbox/review/timeline",
      params,
      search,
      replace: true,
    });
  },
});
