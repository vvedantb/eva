import { createFileRoute } from "@tanstack/react-router";

// Canonical quick-task detail URL is `/quick-tasks/$numId` (no tab segment).
// The layout route renders the detail; this match only needs to exist.
export const Route = createFileRoute("/_repo/$owner/$repo/quick-tasks/$numId/")(
  {
    component: () => null,
  },
);
