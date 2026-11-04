/**
 * GitHub labels Eva puts on the PRs it opens. Draft is a PR status
 * (`draft: true` on create, then ready-for-review), never a label.
 */

/**
 * Older Eva PRs carry a `draft` label. Ready-for-review removes it so the
 * label never contradicts the PR's real draft status.
 */
export const LEGACY_DRAFT_LABEL = "draft";

/** Last segment of a monorepo app directory, e.g. `apps/web` → `web`. */
function appLabel(rootDirectory: string | undefined): string[] {
  const label = rootDirectory?.split("/").pop();
  return label ? [label] : [];
}

/** Labels for a session PR: primary repo or a linked repo (no app dir). */
export function sessionPullRequestLabels(
  rootDirectory: string | undefined,
): string[] {
  return ["eva", "session", ...appLabel(rootDirectory)];
}

/** Labels for a quick-task or project PR. */
export function taskPullRequestLabels(params: {
  rootDirectory: string;
  isQuickTask: boolean;
}): string[] {
  return [
    "eva",
    params.isQuickTask ? "quick-task" : "project",
    ...appLabel(params.rootDirectory),
  ];
}

/** True when a PR still has the legacy `draft` label. */
export function hasLegacyDraftLabel(labels: { name?: string }[]): boolean {
  return labels.some((label) => label.name === LEGACY_DRAFT_LABEL);
}
