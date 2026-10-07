import type { Id } from "../_generated/dataModel";

/**
 * Every branch Eva creates and publishes is namespaced under this prefix, and
 * four independent gates key off it: Vercel skips git deployments for
 * `eva/**` (root and `apps/web/vercel.json`), `persistTurnWork` only pushes a
 * turn's uncommitted work on an eva-owned branch, `turnCheckpoint` only
 * checkpoints on one, and `isEvaOwnedBranch` allows force-push recovery only
 * on one. A builder that escapes the prefix loses all four silently — it
 * type-checks, publishes fine, and only shows up as wasted Vercel builds plus
 * turns whose work is erased when the sandbox VM dies.
 */
export const EVA_BRANCH_PREFIX = "eva/";

/** Per-run automation branch so each run can open a fresh PR. */
export function buildAutomationRunBranchName(
  automationId: Id<"automations">,
  runId: Id<"automationRuns">,
): string {
  return `${EVA_BRANCH_PREFIX}automation-${String(automationId)}-${String(runId)}`;
}

/** Project sandbox branch; v2+ after merge so the next cycle gets a new name. */
export function buildProjectBranchName(
  projectId: Id<"projects">,
  branchVersion?: number,
): string {
  const version = branchVersion ?? 1;
  if (version <= 1) {
    return `${EVA_BRANCH_PREFIX}project-${projectId}`;
  }
  return `${EVA_BRANCH_PREFIX}project-${projectId}-v${version}`;
}

/** Converts text to a URL-safe lowercase slug, truncated to 50 characters. */
function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return slug || "untitled";
}

/** Test-generation branch for a doc, named from its title. */
export function buildTestGenBranchName(docTitle: string): string {
  return `${EVA_BRANCH_PREFIX}tests-doc-${slugify(docTitle)}`;
}
