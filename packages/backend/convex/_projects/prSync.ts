import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { extractPrNumberFromUrl } from "../_github/prUrl";
import {
  schedulePrLifecycleActions,
  selectPrLifecycleTransition,
} from "../_github/prLifecycleActions";

export { extractPrNumberFromUrl };

type ProjectPhase = Doc<"projects">["phase"];

const REVIEW_PHASES: ReadonlySet<ProjectPhase> = new Set([
  "business_review",
  "code_review",
]);

/**
 * Mirrors quick-task PR sync for the single project PR: business_review ↔ draft,
 * code_review ↔ ready for review.
 */
export async function scheduleProjectPrSync(
  ctx: MutationCtx,
  project: Doc<"projects">,
  previousPhase: ProjectPhase,
  newPhase: ProjectPhase,
): Promise<void> {
  if (!project.prUrl) return;

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

  const prNumber = extractPrNumberFromUrl(project.prUrl);
  if (!prNumber) return;

  const repo = await ctx.db.get(project.repoId);
  if (!repo) return;

  await schedulePrLifecycleActions(
    ctx,
    {
      installationId: repo.installationId,
      repoOwner: repo.owner,
      repoName: repo.name,
      prNumber,
    },
    transition,
  );

  // Write the reviewer-facing description here rather than at the end of every
  // task run: this is the moment the project's work is offered for review, so
  // the diff is final and it costs one model call per review instead of one
  // per task (mirrors a quick task's code_review transition and a session's
  // "Send for review"). Scheduled, not awaited, and best-effort — a stopped
  // sandbox just logs and leaves the static PR body in place.
  if (enteringCodeReview && project.sandboxId) {
    await ctx.scheduler.runAfter(0, internal.github.generatePrDescription, {
      installationId: repo.installationId,
      repoOwner: repo.owner,
      repoName: repo.name,
      prUrl: project.prUrl,
      sandboxId: project.sandboxId,
      repoId: project.repoId,
    });
  }
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
