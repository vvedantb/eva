import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { createNotification } from "../notifications";
import {
  cancelSessionSandboxGraceDelete,
  scheduleSessionSandboxGraceDelete,
} from "../sandboxCleanup";
import {
  clearArchivedPrStates,
  listOwnerPullRequests,
  type PrState,
} from "../_pullRequests/store";
import { requestSessionSandboxStop } from "./sandbox";

/**
 * A session auto-archives only once every PR it holds is terminal (merged or
 * closed) — the primary's, each linked repo's, and any the agent opened on a
 * side branch. A single live PR keeps the whole session live. A session with
 * no PR at all never archives through this rule.
 */
export function shouldArchiveSession(states: readonly PrState[]): boolean {
  if (states.length === 0) return false;
  return states.every((state) => state === "merged" || state === "closed");
}

/** One pull request that took part in a session's auto-archive. */
export type SessionArchiveTriggerPr = {
  url: string;
  prNumber?: number;
  merged: boolean;
};

/**
 * Inbox copy for a session auto-archived because every PR it holds is now
 * merged or closed. `prs` is exactly the set of PRs that made the archive rule
 * pass, so a single-PR session reads as it always has.
 */
export function sessionPrArchiveNotificationCopy(args: {
  sessionTitle: string;
  prs: SessionArchiveTriggerPr[];
}): { title: string; message: string } {
  const refs = args.prs.map((pr) =>
    pr.prNumber !== undefined ? `PR #${pr.prNumber}` : pr.url,
  );
  const refsList = refs.join(", ");
  const urlsList = args.prs.map((pr) => pr.url).join(", ");

  if (args.prs.length === 1) {
    const pr = args.prs[0];
    return pr.merged
      ? {
          title: `${refsList} merged — "${args.sessionTitle}" archived`,
          message: `${refsList} was merged on GitHub (${pr.url}). Your session was archived.`,
        }
      : {
          title: `${refsList} closed — "${args.sessionTitle}" archived`,
          message: `${refsList} was closed on GitHub without merging (${pr.url}). Your session was archived.`,
        };
  }

  const allMerged = args.prs.every((pr) => pr.merged);
  const verb = allMerged ? "merged" : "closed";
  return {
    title: `${refsList} ${verb} — "${args.sessionTitle}" archived`,
    message: `Your session was archived because every pull request it opened is now closed: ${urlsList}.`,
  };
}

/** Inbox-only notice to the session owner. Never emails (see DIGEST_EXCLUDED_TYPES). */
async function notifySessionOwnerOfPrArchive(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  prs: SessionArchiveTriggerPr[],
): Promise<void> {
  if (prs.length === 0) return;
  const copy = sessionPrArchiveNotificationCopy({
    sessionTitle: session.title,
    prs,
  });
  await createNotification(ctx, {
    userId: session.createdBy ?? session.userId,
    type: "session_archived",
    title: copy.title,
    message: copy.message,
    repoId: session.repoId,
    sessionId: session._id,
  });
}

/**
 * Applies the archive/unarchive side effects (sandbox stop, grace-delete,
 * owner notification) once every PR row the session holds is up to date. The
 * one place a PR state change moves a session in or out of the archive, so a
 * multi-PR session archives exactly once — when its last live PR lands.
 */
export async function reconcileSessionArchiveState(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
): Promise<void> {
  const session = await ctx.db.get(sessionId);
  if (!session) return;
  const rows = await listOwnerPullRequests(ctx.db, {
    kind: "session",
    sessionId,
  });
  const archive = shouldArchiveSession(rows.map((row) => row.state));
  const needsArchive = archive && session.archived !== true;
  const needsUnarchive = !archive && session.archived === true;
  if (!needsArchive && !needsUnarchive) return;

  await ctx.db.patch(session._id, {
    archived: needsArchive,
    updatedAt: Date.now(),
  });

  if (needsArchive) {
    const archivedSession: Doc<"sessions"> = { ...session, archived: true };
    // Merged/closed sessions are read-only — stop any live sandbox so VMs
    // aren't left running forever after the last PR the session opened lands.
    if (
      session.status === "active" ||
      session.status === "starting" ||
      session.status === "stopping" ||
      session.sandboxId !== undefined
    ) {
      await requestSessionSandboxStop(ctx, session._id);
    }
    await scheduleSessionSandboxGraceDelete(ctx, archivedSession);
    // Primary first, then in the order the PRs were opened.
    const ordered = [...rows].sort(
      (a, b) => Number(b.primary) - Number(a.primary) || a.createdAt - b.createdAt,
    );
    await notifySessionOwnerOfPrArchive(
      ctx,
      session,
      ordered.map((row) => ({
        url: row.prUrl,
        prNumber: row.prNumber,
        merged: row.state === "merged",
      })),
    );
  } else {
    await clearArchivedPrStates(ctx, { kind: "session", sessionId });
    await cancelSessionSandboxGraceDelete(ctx, session._id);
  }
}
