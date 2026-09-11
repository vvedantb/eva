import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { extractPrNumberFromUrl } from "../_github/prUrl";
import { schedulePrLifecycleActions } from "../_github/prLifecycleActions";

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
  await schedulePrLifecycleActions(
    ctx,
    {
      installationId: repo.installationId,
      repoOwner: repo.owner,
      repoName: repo.name,
      prNumber,
    },
    action.kind === "close"
      ? { kind: "close" }
      : { kind: "reopen", asReady: action.asReady },
  );
}
