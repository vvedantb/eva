import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_repo/$owner/$repo/quick-tasks/$numId/sandbox/review/summary",
)({
  // Shell is rendered by the `sandbox` layout so Preview/Console stay mounted.
  component: () => null,
});
