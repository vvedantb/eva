import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_repo/$owner/$repo/projects/$numId/sandbox/review/diffs",
)({
  // Shell is rendered by the `$numId` layout so Preview/Console stay mounted.
  component: () => null,
});
