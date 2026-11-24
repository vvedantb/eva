import { createFileRoute, redirect } from "@tanstack/react-router";
import { reviewPathFromSearch } from "@/lib/search-params";

export const Route = createFileRoute(
  "/projects/$owner/$repo/$numId/sandbox/review/",
)({
  beforeLoad: ({ params, search }) => {
    const dest = reviewPathFromSearch(search);
    if (dest.kind === "summary") {
      throw redirect({
        to: "/projects/$owner/$repo/$numId/sandbox/review/summary",
        params: {
          owner: params.owner,
          repo: params.repo,
          numId: params.numId,
        },
        search: (prev) => ({
          ...prev,
          prTab: undefined,
          diffView: undefined,
        }),
        replace: true,
      });
    }
    if (dest.kind === "timeline") {
      throw redirect({
        to: "/projects/$owner/$repo/$numId/sandbox/review/timeline",
        params: {
          owner: params.owner,
          repo: params.repo,
          numId: params.numId,
        },
        search: (prev) => ({
          ...prev,
          prTab: undefined,
          diffView: undefined,
        }),
        replace: true,
      });
    }
    throw redirect({
      to: "/projects/$owner/$repo/$numId/sandbox/review/diffs/$diffView",
      params: {
        owner: params.owner,
        repo: params.repo,
        numId: params.numId,
        diffView: dest.diffView,
      },
      search: (prev) => ({ ...prev, prTab: undefined, diffView: undefined }),
      replace: true,
    });
  },
});
