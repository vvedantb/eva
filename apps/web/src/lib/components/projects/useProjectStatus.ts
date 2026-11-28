import { useQuery } from "convex-helpers/react/cache/hooks";
import { projectStatusHooks } from "@eva/shared/projectStatusHooks";

export type { ProjectTaskListRow } from "@eva/shared/projectStatusHooks";

export const { useProjectTaskStatus, useProjectListStatuses, useProjectTaskNotes } =
  projectStatusHooks(useQuery);
