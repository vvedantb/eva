import { createFileRoute, redirect } from "@tanstack/react-router";

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
