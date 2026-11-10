import { api } from "@eva/backend";
import { createFileRoute } from "@tanstack/react-router";
import { prefetchRepo, prewarm } from "@/lib/convexPrefetch";
import { ProjectsClient } from "./ProjectsClient";

export const Route = createFileRoute("/_repo/$owner/$repo/projects/")({
  staticData: { title: "Projects" },
  // Warms the page's queries on sidebar hover (router intent preload), so the
  // first open paints from the client cache. Never blocks the navigation.
  loader: ({ params }) => {
    void prefetchProjects(params).catch(() => undefined);
  },
  component: ProjectsClient,
});

/** Same queries and args as `ProjectsClient` and `ProjectsTimeline`. */
async function prefetchProjects(params: { owner: string; repo: string }) {
  const repo = await prefetchRepo(params);
  if (!repo) return;
  const byRepo = { repoId: repo._id };
  prewarm(api.projects.list, byRepo);
  prewarm(api.projects.listTaskProgress, byRepo);
}
