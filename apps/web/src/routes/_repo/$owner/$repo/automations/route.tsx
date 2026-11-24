import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { repoFilterKeyFromParams } from "@/lib/utils/repoUrl";

export const Route = createFileRoute("/_repo/$owner/$repo/automations")({
  component: AutomationsLayout,
});

function AutomationsLayout() {
  const simpleView = useSimpleView();
  const { owner, repo } = Route.useParams();

  if (simpleView) {
    return (
      <Navigate
        to="/projects"
        search={{ repo: repoFilterKeyFromParams({ owner, repo }) }}
        replace
      />
    );
  }

  return <Outlet />;
}
