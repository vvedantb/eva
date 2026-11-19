/**
 * Project phases that may start the preview sandbox: only once a project has
 * work to preview. The backend gate (`_projects/previewGate.ts`) and the web
 * Start button both read this list.
 */
export const PROJECT_PREVIEW_PHASES = [
  "in_progress",
  "business_review",
  "code_review",
] as const;

export function isProjectPreviewPhase(phase: string | undefined): boolean {
  return PROJECT_PREVIEW_PHASES.some((allowed) => allowed === phase);
}
