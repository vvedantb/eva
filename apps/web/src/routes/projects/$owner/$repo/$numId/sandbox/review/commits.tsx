import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy review tab, folded into Timeline when the tabs became three. */
export const Route = createFileRoute(
  "/projects/$owner/$repo/$numId/sandbox/review/commits",
)({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/projects/$owner/$repo/$numId/sandbox/review/timeline",
      params,
      search,
      replace: true,
    });
  },
});
