import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import { SANDBOX_DELETE_GRACE_MS } from "../_sandbox/vercelSnapshotOptions";

/**
 * Session archive lifecycle. One field, `sessions.archive`, holds it:
 *
 *   live (archive unset) ──archive──▶ archived { archivedAt, sandboxDeleteAfter? }
 *        ▲                                 │ sandbox deleted: sandboxDeleteAfter cleared
 *        └────────────unarchive────────────┘
 *
 * A delete time exists only inside an archive, so "delete time but live" and
 * "archived but the time disagrees" cannot be written. Every write to it goes
 * through this module.
 */
type ArchiveFields = Pick<Doc<"sessions">, "archive">;

export function isSessionArchived(session: ArchiveFields): boolean {
  return session.archive !== undefined;
}

/** Earliest time the archived session's sandbox may be deleted. */
export function sessionDeleteAfter(session: ArchiveFields): number | undefined {
  return session.archive?.sandboxDeleteAfter;
}

/**
 * Archives the session and, when it holds a sandbox, schedules that sandbox's
 * delete after the 48h grace. Re-archiving keeps the first `archivedAt` and
 * restarts the grace. Duplicate schedules are harmless: the delete re-checks
 * at fire time. Stopping the sandbox is the caller's job.
 */
export async function archiveSession(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<void> {
  const now = Date.now();
  const sandboxDeleteAfter = session.sandboxId
    ? now + SANDBOX_DELETE_GRACE_MS
    : undefined;
  await ctx.db.patch(session._id, {
    archive: {
      archivedAt: session.archive?.archivedAt ?? now,
      sandboxDeleteAfter,
    },
    updatedAt: now,
  });
  if (sandboxDeleteAfter === undefined) return;
  await ctx.scheduler.runAfter(
    SANDBOX_DELETE_GRACE_MS,
    internal.sandboxCleanup.maybeDeleteSessionSandbox,
    { sessionId: session._id },
  );
}

/**
 * Returns the session to the live list. Clearing the archive also cancels a
 * pending sandbox delete: `maybeDeleteSessionSandbox` skips live sessions.
 * `touch` moves it to the top of the list (PR reopened); a manual unarchive
 * keeps its place.
 */
export async function unarchiveSession(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  options: { touch: boolean },
): Promise<void> {
  await ctx.db.patch(sessionId, {
    archive: undefined,
    ...(options.touch ? { updatedAt: Date.now() } : {}),
  });
}

/**
 * Records that the archived session's sandbox was deleted: the sandbox id and
 * the pending delete time go together. The session stays archived.
 */
export async function clearDeletedSessionSandbox(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<void> {
  const { archive } = session;
  await ctx.db.patch(session._id, {
    sandboxId: undefined,
    archive: archive && { archivedAt: archive.archivedAt },
  });
}

/**
 * A repo's non-deleted standalone sessions, live or archived. Sessions a task
 * or project owns never list here. `newest` reads only that many, newest
 * first (archived: most recently archived).
 */
export async function listRepoSessionsByArchive(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
  archived: boolean,
  newest?: number,
): Promise<Doc<"sessions">[]> {
  const query = db
    .query("sessions")
    .withIndex("by_repo_owner_deleted_and_archived_at", (q) => {
      const notDeleted = q
        .eq("repoId", repoId)
        .eq("owner.kind", "standalone")
        .eq("deletedAt", undefined);
      return archived
        ? notDeleted.gte("archive.archivedAt", 0)
        : notDeleted.eq("archive.archivedAt", undefined);
    });
  return newest === undefined
    ? query.collect()
    : query.order("desc").take(newest);
}
