import { publishErrorNeedsForcePush, type Id } from "@eva/backend";
import { repoDisplayLabel } from "./repoTile";

/** Which checkout a confirmed force-push rewrites. */
export interface ForcePushTarget {
  sessionRepoId?: Id<"sessionRepos">;
  label?: string;
}

/** True while the newest message is the rewritten-branch publish refusal. */
export function needsPublishRecovery(
  newest:
    | { readonly isSystemAlert?: boolean; readonly errorDetail?: string }
    | null
    | undefined,
): boolean {
  return (
    newest?.isSystemAlert === true &&
    typeof newest.errorDetail === "string" &&
    publishErrorNeedsForcePush(newest.errorDetail)
  );
}

/**
 * Identity of one force-push offer. Scoped to the refusal message so a new
 * refusal re-offers every repo instead of showing a stale "requested" state.
 */
export function forcePushOfferKey(
  messageId: string,
  target: ForcePushTarget,
): string {
  return `${messageId}:${target.sessionRepoId ?? "primary"}`;
}

/**
 * A multi-repo session's linked clones that were published: each has its own
 * branch on GitHub to recover. Divergence is only detected for the session
 * branch as a whole, so they are offered on the same refusal.
 */
export function linkedForcePushTargets(
  repos:
    | readonly {
        kind: "primary" | "linked";
        sessionRepoId?: Id<"sessionRepos">;
        prUrl?: string;
        label?: string;
        name: string;
        rootDirectory?: string;
      }[]
    | undefined,
): { sessionRepoId: Id<"sessionRepos">; label: string }[] {
  if (repos === undefined || repos.length <= 1) return [];
  return repos.flatMap((repo) =>
    repo.kind === "linked" &&
    repo.sessionRepoId !== undefined &&
    repo.prUrl !== undefined
      ? [{ sessionRepoId: repo.sessionRepoId, label: repoDisplayLabel(repo) }]
      : [],
  );
}

export const PUBLISH_RECOVERY_COPY = {
  badge: "Publish blocked",
  requested: "Force-push requested — the result will appear in the chat.",
  rewritten:
    "The branch history was rewritten. Updating GitHub needs a force-push.",
  rewrittenAsleep:
    "The branch history was rewritten. Wake the sandbox, then force-push to update GitHub.",
  button: "Force-push branch",
  failed: "Couldn't start the force-push",
  confirm: "Force-push",
  confirmBody:
    "This replaces the branch on GitHub (and the PR's commits) with the sandbox's local history. Commits that exist only on GitHub for this branch will be discarded. If the branch was rebased onto a different base, retarget the PR afterwards.",
};

/** The banner's line under the badge. */
export function publishRecoveryMessage(
  requested: boolean,
  isSandboxActive: boolean,
): string {
  if (requested) return PUBLISH_RECOVERY_COPY.requested;
  return isSandboxActive
    ? PUBLISH_RECOVERY_COPY.rewritten
    : PUBLISH_RECOVERY_COPY.rewrittenAsleep;
}

export function forcePushConfirmTitle(label: string | undefined): string {
  return label
    ? `Force-push ${label} branch to GitHub?`
    : "Force-push branch to GitHub?";
}

/** A linked repo's row text. */
export function linkedRepoRecoveryText(
  label: string,
  requested: boolean,
): string {
  return requested
    ? `Force-push requested for ${label}.`
    : `${label} has its own published branch.`;
}

export function linkedRepoForcePushLabel(label: string): string {
  return `Force-push ${label}`;
}
