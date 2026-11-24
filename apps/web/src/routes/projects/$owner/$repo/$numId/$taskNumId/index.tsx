import { createFileRoute } from "@tanstack/react-router";

/**
 * One project task: its own chat and sandbox in place of the coordinator's.
 * The shell is rendered by the `$numId` layout so the header stays mounted.
 */
export const Route = createFileRoute(
  "/projects/$owner/$repo/$numId/$taskNumId/",
)({
  component: () => null,
});
