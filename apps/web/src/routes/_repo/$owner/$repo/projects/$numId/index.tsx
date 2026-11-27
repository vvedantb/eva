import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_repo/$owner/$repo/projects/$numId/")({
  // Shell is rendered by the `$numId` layout so the header stays mounted.
  component: () => null,
});
