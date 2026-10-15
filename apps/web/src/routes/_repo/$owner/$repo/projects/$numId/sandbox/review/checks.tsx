import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy review tab, folded into Summary when the tabs became three. */
export const Route = createFileRoute(
  "/_repo/$owner/$repo/projects/$numId/sandbox/review/checks",
)({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/$owner/$repo/projects/$numId/sandbox/review/summary",
      params,
      search,
      replace: true,
    });
  },
});
