import type { Doc } from "../_generated/dataModel";
import { isProjectPreviewPhase, PROJECT_PREVIEW_PHASES } from "@eva/shared";

/**
 * Whether a project may start its preview sandbox: only once it has work to
 * preview (`PROJECT_PREVIEW_PHASES`). Shared by the project session's Start
 * and chat wake (`sessions.startSandbox`) and the legacy project Start.
 */
export function isProjectPreviewAllowed(
  project: Pick<Doc<"projects">, "phase">,
): boolean {
  return isProjectPreviewPhase(project.phase);
}

/** The error a disallowed project preview start throws. */
export function projectPreviewNotAllowedError(
  project: Pick<Doc<"projects">, "phase">,
): Error {
  return new Error(
    `Project must be in ${PROJECT_PREVIEW_PHASES.join(", ")} to start sandbox. Current phase: ${project.phase}`,
  );
}
