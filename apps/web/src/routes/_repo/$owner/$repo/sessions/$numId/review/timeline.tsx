import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_repo/$owner/$repo/sessions/$numId/review/timeline",
)({
  component: () => null,
});
