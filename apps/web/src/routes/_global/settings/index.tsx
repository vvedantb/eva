import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/settings` is a layout with no view of its own, so without this the bare
 * path rendered an empty outlet. It lands on the first entry of
 * `GLOBAL_SETTINGS_NAV` — Theme, which simple view also shows, so the layout's
 * own simple-view redirect never has to catch this.
 */
export const Route = createFileRoute("/_global/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/theme", replace: true });
  },
});
