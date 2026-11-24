import { createFileRoute, redirect } from "@tanstack/react-router";
import { reviewPathFromSearch } from "@/lib/search-params";

export const Route = createFileRoute(
  "/projects/$owner/$repo/$numId/sandbox/review/diffs/",
)({
  beforeLoad: ({ params, search }) => {
    const dest = reviewPathFromSearch(search);
    const diffView = dest.kind === "diffs" ? dest.diffView : "unified";
    throw redirect({
      to: "/projects/$owner/$repo/$numId/sandbox/review/diffs/$diffView",
      params: {
        owner: params.owner,
        repo: params.repo,
        numId: params.numId,
        diffView,
      },
      search: (prev) => ({ ...prev, prTab: undefined, diffView: undefined }),
      replace: true,
    });
  },
});
