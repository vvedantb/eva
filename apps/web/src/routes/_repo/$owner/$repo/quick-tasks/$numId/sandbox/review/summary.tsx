import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_repo/$owner/$repo/quick-tasks/$numId/sandbox/review/summary",
)({
  component: () => null,
});
