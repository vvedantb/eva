import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/projects/$owner/$repo/$numId/sandbox/review",
)({
  // Shell is rendered by the `$numId` layout so Preview/Console stay mounted.
  component: () => null,
});
