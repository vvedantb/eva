import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy `/projects/$numId/$taskNumId/$detailTab` (e.g. `/activity`) redirects
// to the task's tab-less URL: a project task now opens on its chat and sandbox.
export const Route = createFileRoute(
  "/projects/$owner/$repo/$numId/$taskNumId/$detailTab",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$owner/$repo/$numId/$taskNumId",
      params: {
        owner: params.owner,
        repo: params.repo,
        numId: params.numId,
        taskNumId: params.taskNumId,
      },
      replace: true,
    });
  },
  component: () => null,
});
