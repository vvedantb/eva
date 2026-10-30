export const FALLBACK_GIT_BASE_BRANCH = "staging";

/**
 * Sandbox repo git config key naming the one branch Eva may auto-commit and
 * auto-push at turn end. Written per turn by `applyBranchPublishPolicy` when
 * the sender has the `manualSideBranchPublish` flag on, unset otherwise.
 * Unset means the old rule: any checked-out `eva/` branch is published.
 */
export const AUTO_PUBLISH_BRANCH_GIT_CONFIG = "eva.autoPublishBranch";

/**
 * Pathspecs every Eva-made commit excludes. Captures are chat deliverables and
 * `plan.md` is scratch, never commits. Mirrors the agent-facing convention in
 * convex/_sessions/prompts.ts.
 */
export const COMMIT_EXCLUDE_PATHSPECS = [
  ":!*.png",
  ":!*.jpg",
  ":!*.jpeg",
  ":!*.gif",
  ":!*.webp",
  ":!*.webm",
  ":!*.mp4",
  ":!*.mov",
  ":!screenshots/",
  ":!recordings/",
  ":!plan.md",
];
