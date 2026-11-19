import { api } from "@eva/backend";
import { createFileRoute } from "@tanstack/react-router";
import { prefetchRepo, prewarm } from "@/lib/convexPrefetch";
import { QuickTasksClient } from "./QuickTasksClient";
import {
  parseCommentAnchorSearchField,
  parseDiffSearchFields,
} from "@/lib/search-params";

// Layout route for the quick-tasks section. Rendering QuickTasksClient here
// (rather than per child route) keeps the list mounted while the open task
// changes, so selecting a task never remounts/scroll-resets the list. The open
// task is read from the child route params inside QuickTasksClient.
export const Route = createFileRoute("/_repo/$owner/$repo/quick-tasks")({
  staticData: { title: "Quick Tasks" },
  // Warms the board's queries on sidebar hover (router intent preload), so the
  // first open paints from the client cache. Never blocks the navigation.
  loader: ({ params }) => {
    void prefetchQuickTasks(params).catch(() => undefined);
  },
  component: QuickTasksClient,
  validateSearch: (search: Record<string, string>) => ({
    draft: typeof search.draft === "string" ? search.draft : undefined,
    ...parseDiffSearchFields(search),
    ...parseCommentAnchorSearchField(search),
  }),
});

/** Same queries and args as `QuickTasksClient`. */
async function prefetchQuickTasks(params: { owner: string; repo: string }) {
  const repo = await prefetchRepo(params);
  if (!repo) return;
  const byRepo = { repoId: repo._id };
  prewarm(api.agentTasks.getAllTasks, byRepo);
  prewarm(api.agentTasks.listDrafts, byRepo);
  prewarm(api.projects.list, byRepo);
  prewarm(api.users.listAll, {});
}
