import { useQuery } from "convex/react";
import { projectStatusHooks } from "@eva/shared/projectStatusHooks";

export type { ProjectTaskListRow } from "@eva/shared/projectStatusHooks";

// The shared project status hooks, the web's own (`@eva/shared/projectStatusHooks`).
export const { useProjectTaskStatus, useProjectListStatuses, useProjectTaskNotes } =
  projectStatusHooks(useQuery);
