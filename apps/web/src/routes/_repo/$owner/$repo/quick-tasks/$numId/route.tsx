import { createFileRoute } from "@tanstack/react-router";

// The open task is rendered by the quick-tasks layout route (../route.tsx),
// which reads this `numId` param. This match only needs to exist; its detail
// tab / sandbox children supply the remaining params.
export const Route = createFileRoute("/_repo/$owner/$repo/quick-tasks/$numId")({
  component: () => null,
});
