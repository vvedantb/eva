import {
  createFileRoute,
  Navigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router";

import { useRepo } from "@/lib/contexts/RepoContext";
import { EntityNumIdGate } from "@/lib/components/EntityNumIdGate";
import {
  useAgentTaskByNumId,
  useProjectByNumId,
} from "@/lib/useResolveByNumId";
import { sandboxTabIdFromParam } from "@/lib/search-params";
import {
  isProjectSandboxTab,
  PROJECT_DEFAULT_SANDBOX_TAB,
  type ProjectSandboxTab,
} from "@/lib/components/projects/projectSandboxTabs";
import type { ProjectMainTab } from "@/lib/components/projects/ProjectMainTabs";
import { ProjectDetailClient } from "../ProjectDetailClient";

const SANDBOX_ROUTE_ID = "/_repo/$owner/$repo/projects/$numId/sandbox";
const SANDBOX_REVIEW_ROUTE_ID =
  "/_repo/$owner/$repo/projects/$numId/sandbox/review";
const OVERVIEW_ROUTE_ID = "/_repo/$owner/$repo/projects/$numId/overview";

/**
 * Project shell. Owns the whole detail page — header tabs and body — so
 * switching Overview/Coordinator, a coordinator rail tab, or opening a task
 * swaps the body only and leaves the header mounted. Every child route
 * renders `null`; they exist for their params and `beforeLoad` redirects.
 */
export const Route = createFileRoute("/_repo/$owner/$repo/projects/$numId")({
  staticData: { title: "Projects" },
  component: ProjectDetailShell,
});

function ProjectDetailShell() {
  const { numId } = Route.useParams();
  const { basePath, repoId } = useRepo();
  // Child params (`taskNumId`, `sandboxTab`) belong to routes this
  // layout renders in place of an Outlet, so read them loosely.
  const params = useParams({ strict: false });
  const isSandboxSurface = useRouterState({
    select: (s) => s.matches.some((m) => m.routeId === SANDBOX_ROUTE_ID),
  });
  const isSandboxReview = useRouterState({
    select: (s) => s.matches.some((m) => m.routeId === SANDBOX_REVIEW_ROUTE_ID),
  });
  const isOverviewTab = useRouterState({
    select: (s) => s.matches.some((m) => m.routeId === OVERVIEW_ROUTE_ID),
  });

  const project = useProjectByNumId(numId, repoId);
  const taskNumId =
    typeof params.taskNumId === "string" ? params.taskNumId : undefined;
  const task = useAgentTaskByNumId(taskNumId, repoId);
  const sandboxTabParam =
    typeof params.sandboxTab === "string" ? params.sandboxTab : undefined;

  const mainTab: ProjectMainTab = isOverviewTab ? "overview" : "work";

  // A legacy `$taskNumId` redirects on its own once the project segment is
  // canonical — `replaceRouteIdSegment` only touches its own segment, so the two
  // hops converge without either knowing about the other.
  if (task.redirectTo !== null) {
    return <Navigate to={task.redirectTo} search={true} replace />;
  }

  return (
    <EntityNumIdGate
      resolve={project}
      entityLabel="project"
      backTo={`${basePath}/projects`}
    >
      {(projectDoc) => (
        <ProjectDetailClient
          projectId={projectDoc._id}
          projectNumId={project.numId ?? undefined}
          mainTab={mainTab}
          // The project index is the coordinator on its Tasks tab.
          sandboxTab={
            isSandboxSurface
              ? sandboxTabFrom(sandboxTabParam, isSandboxReview)
              : PROJECT_DEFAULT_SANDBOX_TAB
          }
          // The task view owns its own loading / not-found states.
          selectedTaskId={
            taskNumId === undefined ? undefined : (task.convexId ?? undefined)
          }
          selectedTaskStatus={taskNumId === undefined ? undefined : task.status}
        />
      )}
    </EntityNumIdGate>
  );
}

function sandboxTabFrom(
  sandboxTabParam: string | undefined,
  isReview: boolean,
): ProjectSandboxTab {
  if (isReview) return "review";
  if (sandboxTabParam !== undefined) {
    const tabId = sandboxTabIdFromParam(sandboxTabParam);
    if (isProjectSandboxTab(tabId)) return tabId;
  }
  return PROJECT_DEFAULT_SANDBOX_TAB;
}
