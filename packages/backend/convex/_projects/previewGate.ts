import type { Doc } from "../_generated/dataModel";

const PREVIEW_ALLOWED_PHASES = [
  "in_progress",
  "business_review",
  "code_review",
] as const;

/**
 * Whether a project may start its preview sandbox: only once it has work to
 * preview. Shared by the project session's Start and chat wake
 * (`sessions.startSandbox`) and the legacy project Start.
 */
export function isProjectPreviewAllowed(
  project: Pick<Doc<"projects">, "phase">,
): boolean {
  return PREVIEW_ALLOWED_PHASES.some((phase) => phase === project.phase);
}

/** The error a disallowed project preview start throws. */
export function projectPreviewNotAllowedError(
  project: Pick<Doc<"projects">, "phase">,
): Error {
  return new Error(
    `Project must be in in_progress, business_review, or code_review to start sandbox. Current phase: ${project.phase}`,
  );
}
