import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { selectPrLifecycleTransition } from "../_github/prLifecycleActions";
import { applyPrLifecycleTransition } from "../_pullRequests/store";

type ProjectPhase = Doc<"projects">["phase"];

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
