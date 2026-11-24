import { api } from "@eva/backend";
import { createFileRoute } from "@tanstack/react-router";
import { prewarm } from "@/lib/convexPrefetch";
import { ProjectsClient } from "./ProjectsClient";

export const Route = createFileRoute("/projects/")({
  staticData: { title: "Projects" },
  // `?repo=` is the repo filter (nuqs owns it); declared so redirects can set it.
  validateSearch: (search: Record<string, string>): { repo?: string } =>
    typeof search.repo === "string" ? { repo: search.repo } : {},
  // Warms the page's queries on rail hover (router intent preload), so the
  // first open paints from the client cache. Never blocks the navigation.
  loader: () => {
    prewarm(api.projects.listAccessible, {});
    prewarm(api.githubRepos.list, {});
  },
  component: ProjectsClient,
});
