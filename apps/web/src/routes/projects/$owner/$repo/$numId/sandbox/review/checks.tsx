import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy review tab, folded into Summary when the tabs became three. */
export const Route = createFileRoute(
  "/projects/$owner/$repo/$numId/sandbox/review/checks",
)({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/projects/$owner/$repo/$numId/sandbox/review/summary",
      params,
      search,
      replace: true,
    });
  },
});
