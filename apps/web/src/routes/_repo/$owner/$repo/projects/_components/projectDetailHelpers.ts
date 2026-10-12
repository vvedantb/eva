import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { isLivePrState } from "@/lib/githubPr";
import { BUILDABLE_PROJECT_PHASES } from "@/lib/components/projects/ProjectPhaseBadge";
import type { useProjectSandbox } from "@/lib/components/projects/useProjectSandbox";
import { parseSpec } from "@/lib/utils/parseSpec";

export type ProjectDetailProject = NonNullable<
  FunctionReturnType<typeof api.projects.get>
>;

type LatestDeployment = FunctionReturnType<
  typeof api.agentRuns.getLatestDeploymentByProject
>;

export type ProjectSandboxState = ReturnType<typeof useProjectSandbox>;

export type ParsedProjectSpec = ReturnType<typeof parseSpec>;

export function getAgentBrowsingAt(
  project: ProjectDetailProject | null | undefined,
) {
  return project === null || project === undefined
    ? undefined
    : project.agentBrowsingAt;
}

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
    !project?.activeBuildWorkflowId &&
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
  const showRetryStartupCommands =
    sandbox.canStartSandbox &&
    !sandbox.isSandboxStarting &&
    !sandbox.isSandboxStopping;
  const showRunBackgroundCommands = sandbox.isSandboxActive;
  const showResolveConflicts =
    isLivePrState(project.prState) &&
    !project.activeBuildWorkflowId &&
    (project.phase === "business_review" || project.phase === "code_review");
  const hasSandboxCommandItems =
    showRetryStartupCommands || showRunBackgroundCommands;
  return {
    canBuildProject,
    showRetryStartupCommands,
    showRunBackgroundCommands,
    showResolveConflicts,
    hasSandboxCommandItems,
  };
}

export function parseProjectSpec(
  generatedSpec: ProjectDetailProject["generatedSpec"],
) {
  if (!generatedSpec) return null;
  try {
    return parseSpec(generatedSpec);
  } catch {
    return null;
  }
}
