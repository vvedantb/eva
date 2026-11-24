import { createFileRoute, redirect } from "@tanstack/react-router";
import { repoFilterKeyFromParams } from "@/lib/utils/repoUrl";

/** No project named: the overview, filtered to this repo. */
export const Route = createFileRoute("/projects/$owner/$repo/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects",
      search: { repo: repoFilterKeyFromParams(params) },
      replace: true,
    });
  },
});
