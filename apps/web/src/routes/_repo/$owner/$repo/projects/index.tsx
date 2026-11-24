import { createFileRoute, redirect } from "@tanstack/react-router";
import { repoFilterKeyFromParams } from "@/lib/utils/repoUrl";

/** Old repo Projects page: the root overview, filtered to this repo. */
export const Route = createFileRoute("/_repo/$owner/$repo/projects/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects",
      search: { repo: repoFilterKeyFromParams(params) },
      replace: true,
    });
  },
});
