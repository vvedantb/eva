import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";
import { TeamDetailClient } from "../TeamDetailClient";
import { isTeamDetailTab } from "@/lib/search-params";
import {
  isSimpleViewHiddenTeamTab,
  useSimpleView,
} from "@/lib/hooks/useSimpleView";

export const Route = createFileRoute("/_global/teams/$teamId/$teamTab")({
  beforeLoad: ({ params }) => {
    // Legacy bookmark: /teams/:id/repos → /teams/:id/codebases
    if (params.teamTab === "repos") {
      throw redirect({
        to: "/teams/$teamId/$teamTab",
        params: {
          teamId: params.teamId,
          teamTab: "codebases",
        },
        replace: true,
      });
    }
    if (!isTeamDetailTab(params.teamTab)) {
      throw redirect({
        to: "/teams/$teamId/$teamTab",
        params: {
          teamId: params.teamId,
          teamTab: "activity",
        },
      });
    }
  },
  component: TeamDetailTabRoute,
});

function TeamDetailTabRoute() {
  const { teamId, teamTab } = Route.useParams();
  const simpleView = useSimpleView();
  if (!isTeamDetailTab(teamTab)) {
    return null;
  }
  if (simpleView && isSimpleViewHiddenTeamTab(teamTab)) {
    return (
      <Navigate
        to="/teams/$teamId/$teamTab"
        params={{ teamId, teamTab: "activity" }}
        replace
      />
    );
  }
  return <TeamDetailClient teamId={teamId} tab={teamTab} />;
}
