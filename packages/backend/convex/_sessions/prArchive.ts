import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { extractPrNumberFromUrl } from "../_projects/prSync";
import { prStateValidator } from "../validators";

export type PrState = Infer<typeof prStateValidator>;

/**
 * A multi-repo session opens one PR per repo (the primary's `session.prUrl` +
 * one per `sessionRepos` row). It only auto-archives once every PR it opened
 * is terminal (merged or closed) — a single still-open linked PR must keep the
 * whole session live, even after the primary's PR merges.
 *
 * `undefined` for a slot means that repo never opened a PR (e.g. a linked repo
 * with no commits yet) and is ignored — it neither blocks nor triggers an
 * archive. But when EVERY slot is undefined, the session has no PR at all, and
 * this must return false rather than vacuously true.
 */
export function shouldArchiveSession(
  primaryState: PrState | undefined,
  linkedStates: Array<PrState | undefined>,
): boolean {
  const openedStates: PrState[] = [];
  if (primaryState !== undefined) openedStates.push(primaryState);
  for (const state of linkedStates) {
    if (state !== undefined) openedStates.push(state);
  }
  if (openedStates.length === 0) return false;
  return openedStates.every(
    (state) => state === "merged" || state === "closed",
  );
}

export type LivePrState = "draft" | "open";

/** Open or draft — the only PR states Eva should close on archive. */
export function livePrState(
  prState: Doc<"sessions">["prState"],
): LivePrState | undefined {
  if (prState === "draft" || prState === "open") return prState;
  return undefined;
}

/** Close or reopen the session's GitHub PR. No-op if the URL or repo is missing. */
export async function scheduleSessionPrSync(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  action: { kind: "close" } | { kind: "reopen"; asReady: boolean },
): Promise<void> {
  if (!session.prUrl) return;
  const repo = await ctx.db.get(session.repoId);
  const prNumber = extractPrNumberFromUrl(session.prUrl);
  if (!repo || prNumber === null) return;
  const base = {
    installationId: repo.installationId,
    repoOwner: repo.owner,
    repoName: repo.name,
    prNumber,
  };
  if (action.kind === "close") {
    await ctx.scheduler.runAfter(
      0,
      internal.taskWorkflowActions.closePullRequest,
      base,
    );
    return;
  }
  await ctx.scheduler.runAfter(
    0,
    internal.taskWorkflowActions.reopenPullRequest,
    { ...base, asReady: action.asReady },
  );
}
