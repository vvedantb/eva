import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import type { useProjectSandbox } from "@/lib/components/projects/useProjectSandbox";

export type ProjectDetailProject = NonNullable<
  FunctionReturnType<typeof api.projects.get>
>;

export type ProjectSandboxState = ReturnType<typeof useProjectSandbox>;
