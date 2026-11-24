import { createFileRoute } from "@tanstack/react-router";

/**
 * Param host for `/projects/$numId/sandbox/…`. The shell is rendered by the
 * `$numId` layout, so Preview iframes / Console survive both sandbox tab
 * switches and crossing back to the task list.
 */
export const Route = createFileRoute(
  "/projects/$owner/$repo/$numId/sandbox",
)({
  component: () => null,
});
