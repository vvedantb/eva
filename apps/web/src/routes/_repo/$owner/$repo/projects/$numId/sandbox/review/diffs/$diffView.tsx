import { createFileRoute, redirect } from "@tanstack/react-router";
import { isDiffView, reviewPathFromSearch } from "@/lib/search-params";

export const Route = createFileRoute(
  "/_repo/$owner/$repo/projects/$numId/sandbox/review/diffs/$diffView",
)({
  beforeLoad: ({ params, search }) => {
    if (!isDiffView(params.diffView)) {
      const dest = reviewPathFromSearch(search);
      const diffView = dest.kind === "diffs" ? dest.diffView : "unified";
      throw redirect({
        to: "/$owner/$repo/projects/$numId/sandbox/review/diffs/$diffView",
        params: {
          owner: params.owner,
          repo: params.repo,
          numId: params.numId,
          diffView,
        },
        search: (prev) => ({ ...prev, prTab: undefined, diffView: undefined }),
        replace: true,
      });
    }
  },
  // Shell is rendered by the `sandbox` layout so Preview/Console stay mounted.
  component: () => null,
});
