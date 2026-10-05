import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy `/pr/recap` → `/review/summary`. */
export const Route = createFileRoute(
  "/_repo/$owner/$repo/sessions/$numId/pr/recap",
)({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/$owner/$repo/sessions/$numId/review/summary",
      params: {
        owner: params.owner,
        repo: params.repo,
        numId: params.numId,
      },
      search,
      replace: true,
    });
  },
});
