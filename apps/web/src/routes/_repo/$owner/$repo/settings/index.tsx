import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_repo/$owner/$repo/settings/")({
  component: SettingsRedirect,
});

// Simple view never reaches this — the settings layout redirects out first.
function SettingsRedirect() {
  const { owner, repo } = Route.useParams();
  return (
    <Navigate
      to="/$owner/$repo/settings/config"
      params={{ owner, repo }}
      replace
    />
  );
}
