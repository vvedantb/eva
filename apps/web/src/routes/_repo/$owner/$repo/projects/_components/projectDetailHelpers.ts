import type { FunctionReturnType } from "convex/server";
import { isProjectBuilding, type api } from "@eva/backend";
import { isLivePrState, parseProjectSpec as parseSpec, type ProjectSpec } from "@eva/shared";
import { BUILDABLE_PROJECT_PHASES } from "@/lib/components/projects/ProjectPhaseBadge";
import type { useProjectSandbox } from "@/lib/components/projects/useProjectSandbox";

export type ProjectDetailProject = NonNullable<
  FunctionReturnType<typeof api.projects.get>
>;

type LatestDeployment = FunctionReturnType<
  typeof api.agentRuns.getLatestDeploymentByProject
>;

export type ProjectSandboxState = ReturnType<typeof useProjectSandbox>;

export type ParsedProjectSpec = ProjectSpec;

// Written with optional chaining so usePrLinkMenuItems can run above the
// early returns in ProjectDetailClient (both read `project` /
// `latestDeployment`, which load late).
export function getProjectPrFlags(
  project: ProjectDetailProject | null | undefined,
  latestDeployment: LatestDeployment | undefined,
) {
  const hasDeployedPreview =
    latestDeployment?.deploymentStatus === "deployed" &&
    Boolean(latestDeployment.deploymentUrl);
  // A merged PR stays linked as history, so only a live one blocks a new PR.
  const canCreatePr =
    !isLivePrState(project?.prState) &&
    !(project && isProjectBuilding(project)) &&
    (project?.phase === "business_review" || project?.phase === "in_progress");
  return { hasDeployedPreview, canCreatePr };
}

export function isProjectDraftOrFinalized(project: ProjectDetailProject) {
  return project.phase === "draft" || project.phase === "finalized";
}

export function getProjectMenuFlags(
  project: ProjectDetailProject,
  sandbox: ProjectSandboxState,
) {
  const canBuildProject = BUILDABLE_PROJECT_PHASES.includes(project.phase);
  const showRunBackgroundCommands = sandbox.isSandboxActive;
  const showResolveConflicts =
    isLivePrState(project.prState) &&
    !isProjectBuilding(project) &&
    (project.phase === "business_review" || project.phase === "code_review");
  const hasSandboxCommandItems = showRunBackgroundCommands;
  return {
    canBuildProject,
    showRunBackgroundCommands,
    showResolveConflicts,
    hasSandboxCommandItems,
  };
}

export function parseProjectSpec(
  generatedSpec: ProjectDetailProject["generatedSpec"],
) {
  return generatedSpec ? parseSpec(generatedSpec) : null;
}
