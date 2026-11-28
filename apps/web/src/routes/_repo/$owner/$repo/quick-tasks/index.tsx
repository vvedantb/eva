import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_repo/$owner/$repo/quick-tasks/")({
  component: () => null,
});
