import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/projects/$owner/$repo/$numId/$taskNumId",
)({
  // Shell is rendered by the `$numId` layout so the header stays mounted.
  component: () => null,
});
