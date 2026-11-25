import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { parseProjectSpec as parseSpec, type ProjectSpec } from "@eva/shared";
import type { useProjectSandbox } from "@/lib/components/projects/useProjectSandbox";

export type ProjectDetailProject = NonNullable<
  FunctionReturnType<typeof api.projects.get>
>;

export type ProjectSandboxState = ReturnType<typeof useProjectSandbox>;

export type ParsedProjectSpec = ProjectSpec;

export function isProjectDraftOrFinalized(project: ProjectDetailProject) {
  return project.phase === "draft" || project.phase === "finalized";
}

export function parseProjectSpec(
  generatedSpec: ProjectDetailProject["generatedSpec"],
) {
  return generatedSpec ? parseSpec(generatedSpec) : null;
}
