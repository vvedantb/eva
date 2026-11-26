import { api } from "@eva/backend";
import { createFileRoute } from "@tanstack/react-router";
import { prefetchRepo, prewarm } from "@/lib/convexPrefetch";
import { ProjectsClient } from "./ProjectsClient";

export const Route = createFileRoute("/_repo/$owner/$repo/projects/")({
  staticData: { title: "Projects" },
  loader: ({ params }) => {
    void prefetchProjects(params).catch(() => undefined);
  },
  component: ProjectsClient,
});

async function prefetchProjects(params: { owner: string; repo: string }) {
  const repo = await prefetchRepo(params);
  if (!repo) return;
  const byRepo = { repoId: repo._id };
  prewarm(api.projects.list, byRepo);
  prewarm(api.projects.listStatusesForRepo, byRepo);
}
