import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy `/quick-tasks/$numId/$detailTab` (e.g. `/activity`) redirects to the
// canonical tab-less URL now that quick tasks only have one detail surface.
export const Route = createFileRoute(
  "/_repo/$owner/$repo/quick-tasks/$numId/$detailTab",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$owner/$repo/quick-tasks/$numId",
      params: {
        owner: params.owner,
        repo: params.repo,
        numId: params.numId,
      },
      // Merge prev so nuqs-managed filter params (q, statuses, …) survive.
      search: (prev) => ({
        ...prev,
        draft: undefined,
        diffFile: undefined,
        diffView: undefined,
        prTab: undefined,
      }),
      replace: true,
    });
  },
  component: () => null,
});
