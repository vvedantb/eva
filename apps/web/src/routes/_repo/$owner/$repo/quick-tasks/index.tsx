import { createFileRoute } from "@tanstack/react-router";

// The quick-tasks page is rendered by the layout route (route.tsx). The index
// match only needs to exist so `/quick-tasks` resolves; QuickTasksClient reads
// the (absent) task selection from params.
export const Route = createFileRoute("/_repo/$owner/$repo/quick-tasks/")({
  component: () => null,
});
