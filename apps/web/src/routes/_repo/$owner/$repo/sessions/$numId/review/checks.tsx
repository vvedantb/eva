import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy review tab, folded into Summary when the tabs became three. */
export const Route = createFileRoute(
  "/_repo/$owner/$repo/sessions/$numId/review/checks",
)({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/$owner/$repo/sessions/$numId/review/summary",
      params,
      search,
      replace: true,
    });
  },
});
