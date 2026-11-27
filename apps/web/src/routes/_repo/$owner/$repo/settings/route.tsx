import {
  createFileRoute,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

export const Route = createFileRoute("/_repo/$owner/$repo/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const simpleView = useSimpleView();
  const { owner, repo } = Route.useParams();

  // Simple view has no repo settings at all — every page here (Skills
  // included) bounces to the repo home so deep links cannot reach them.
  if (simpleView) {
    return <Navigate to="/$owner/$repo" params={{ owner, repo }} replace />;
  }

  return <Outlet />;
}
