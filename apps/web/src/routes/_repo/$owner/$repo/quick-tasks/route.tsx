import { createFileRoute } from "@tanstack/react-router";
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
  component: QuickTasksClient,
  validateSearch: (search: Record<string, string>) => ({
    draft: typeof search.draft === "string" ? search.draft : undefined,
    ...parseDiffSearchFields(search),
    ...parseCommentAnchorSearchField(search),
  }),
});
