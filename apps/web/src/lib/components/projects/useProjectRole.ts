import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";

/**
 * True when the reader is a viewer of the project (`projects.get`
 * `callerRole`): they read everything and file feedback, but never chat,
 * approve, run or change settings. False for a quick task (no project) and
 * while the project loads, so nothing flashes read-only for a contributor.
 */
export function useIsProjectViewer(
  projectId: Id<"projects"> | undefined,
): boolean {
  const project = useQuery(
    api.projects.get,
    projectId ? { id: projectId } : "skip",
  );
  return project?.callerRole === "viewer";
}
