import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_repo/$owner/$repo/projects/$numId/sandbox/review/timeline",
)({
  // Shell is rendered by the `sandbox` layout so Preview/Console stay mounted.
  component: () => null,
});
