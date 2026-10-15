import { createFileRoute, redirect } from "@tanstack/react-router";
import { isDiffView, reviewPathFromSearch } from "@/lib/search-params";

/** Legacy `/pr` → `/review`. */
export const Route = createFileRoute("/_repo/$owner/$repo/sessions/$numId/pr/")(
  {
    beforeLoad: ({ params, search }) => {
      const prTab =
        reviewPathFromSearch(search).kind;

      if (prTab === "summary") {
        throw redirect({
          to: "/$owner/$repo/sessions/$numId/review/summary",
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

      if (prTab === "timeline") {
        throw redirect({
          to: "/$owner/$repo/sessions/$numId/review/timeline",
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

      const diffView =
        "diffView" in search &&
        typeof search.diffView === "string" &&
        isDiffView(search.diffView)
          ? search.diffView
          : "unified";

      throw redirect({
        to: "/$owner/$repo/sessions/$numId/review/diffs/$diffView",
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
  },
);
