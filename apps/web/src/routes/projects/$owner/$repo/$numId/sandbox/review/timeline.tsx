import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/projects/$owner/$repo/$numId/sandbox/review/timeline",
)({
  // Shell is rendered by the `sandbox` layout so Preview/Console stay mounted.
  component: () => null,
});
