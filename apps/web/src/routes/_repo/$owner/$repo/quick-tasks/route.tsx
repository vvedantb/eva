import { api } from "@eva/backend";
import { createFileRoute } from "@tanstack/react-router";
import { prefetchRepo, prewarm } from "@/lib/convexPrefetch";
import { QuickTasksClient } from "./QuickTasksClient";
import {
  parseCommentAnchorSearchField,
  parseDiffSearchFields,
} from "@/lib/search-params";

export const Route = createFileRoute("/_repo/$owner/$repo/quick-tasks")({
  staticData: { title: "Quick Tasks" },
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

async function prefetchQuickTasks(params: { owner: string; repo: string }) {
  const repo = await prefetchRepo(params);
  if (!repo) return;
  const byRepo = { repoId: repo._id };
  prewarm(api.agentTasks.getAllTasks, byRepo);
  prewarm(api.agentTasks.listDrafts, byRepo);
  prewarm(api.projects.list, byRepo);
  prewarm(api.users.listAll, {});
}
