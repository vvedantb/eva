import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { selectPrLifecycleTransition } from "../_github/prLifecycleActions";
import { applyPrLifecycleTransition } from "../_pullRequests/store";

type ProjectPhase = Doc<"projects">["phase"];

const REVIEW_PHASES: ReadonlySet<ProjectPhase> = new Set([
  "business_review",
  "code_review",
]);

/**
 * Mirrors quick-task PR sync for a project's PRs: business_review ↔ draft and
 * code_review ↔ ready on the primary PR; cancelling closes every live PR.
 */
export async function scheduleProjectPrSync(
  ctx: MutationCtx,
  project: Doc<"projects">,
  previousPhase: ProjectPhase,
  newPhase: ProjectPhase,
): Promise<void> {
  const enteringCodeReview =
    newPhase === "code_review" && previousPhase !== "code_review";
  const enteringCancelled =
    newPhase === "cancelled" && previousPhase !== "cancelled";
  const leavingCancelled =
    previousPhase === "cancelled" &&
    newPhase !== "cancelled" &&
    newPhase !== "completed";
  const leavingCodeReview =
    previousPhase === "code_review" &&
    newPhase !== "code_review" &&
    newPhase !== "completed" &&
    newPhase !== "cancelled";

  if (
    !enteringCodeReview &&
    !leavingCodeReview &&
    !enteringCancelled &&
    !leavingCancelled
  ) {
    return;
  }

  const transition = selectPrLifecycleTransition({
    enteringCancelled,
    leavingCancelled,
    enteringCodeReview,
    leavingCodeReview,
    asReadyOnReopen: newPhase === "code_review",
  });
  if (!transition) return;

  await applyPrLifecycleTransition(
    ctx,
    { kind: "project", projectId: project._id },
    transition,
  );
}

/** Maps GitHub PR webhook actions to project review phases (inbound sync). */
export function deriveProjectPhaseFromPrEvent(
  action: string,
  draft: boolean | undefined,
): ProjectPhase | null {
  if (action === "converted_to_draft") return "business_review";
  if (action === "ready_for_review") return "code_review";
  if (action === "opened" || action === "reopened") {
    return draft ? "business_review" : "code_review";
  }
  return null;
}

export function isProjectReviewPhase(phase: ProjectPhase): boolean {
  return REVIEW_PHASES.has(phase);
}
