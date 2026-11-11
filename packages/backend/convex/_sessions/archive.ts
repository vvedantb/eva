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
 *
 * Transition: older rows still carry the legacy `archived` /
 * `sandboxDeleteAfter` pair until `dataMigrations:backfillSessionArchive` runs.
 * Reads fall back to them (`sessionArchive`); every write here clears them.
 * The legacy fields, the fallback and the legacy index read go in 0e.
 */
export type SessionArchive = NonNullable<Doc<"sessions">["archive"]>;

type ArchiveFields = Pick<
  Doc<"sessions">,
  "archive" | "archived" | "sandboxDeleteAfter" | "updatedAt" | "_creationTime"
>;

/** Written with every archive write, so no row keeps the legacy pair. */
const legacyCleared = { archived: undefined, sandboxDeleteAfter: undefined };

/**
 * The session's archive, or undefined while it is live. A legacy row never
 * recorded when it was archived; its last update is the closest time we have.
 */
export function sessionArchive(session: ArchiveFields): SessionArchive | undefined {
  if (session.archive !== undefined) return session.archive;
  if (session.archived !== true) return undefined;
  return {
    archivedAt: session.updatedAt ?? session._creationTime,
    sandboxDeleteAfter: session.sandboxDeleteAfter,
  };
}

export function isSessionArchived(session: ArchiveFields): boolean {
  return sessionArchive(session) !== undefined;
}

/**
 * The doc as clients see it: `archive` resolved through the legacy fallback,
 * so a row the migration has not reached yet still reads as archived.
 */
export function withResolvedArchive(
  session: Doc<"sessions"> | null,
): Doc<"sessions"> | null {
  return session && { ...session, archive: sessionArchive(session) };
}

/**
 * Earliest time the archived session's sandbox may be deleted. A live session
 * never has one: a legacy time left on a live row is ignored.
 */
export function sessionDeleteAfter(session: ArchiveFields): number | undefined {
  return sessionArchive(session)?.sandboxDeleteAfter;
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
    ...legacyCleared,
    archive: {
      archivedAt: sessionArchive(session)?.archivedAt ?? now,
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
    ...legacyCleared,
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
  const archive = sessionArchive(session);
  await ctx.db.patch(session._id, {
    ...legacyCleared,
    sandboxId: undefined,
    archive: archive && { archivedAt: archive.archivedAt },
  });
}

/**
 * Migration patch from the legacy pair to `archive`, or undefined when the row
 * has nothing to move. Idempotent: a migrated row has no legacy fields left.
 */
export function legacyArchiveMigrationPatch(session: Doc<"sessions">) {
  if (session.archived === undefined && session.sandboxDeleteAfter === undefined) {
    return undefined;
  }
  return { ...legacyCleared, archive: sessionArchive(session) };
}

/**
 * A repo's non-deleted sessions, live or archived. `newest` reads only that
 * many per index, newest first (archived: most recently archived). Legacy
 * archived rows sit in the live bucket of the new index, so the live read
 * filters them out and the archived read adds them from the legacy index.
 */
export async function listRepoSessionsByArchive(
  db: DatabaseReader,
  repoId: Id<"githubRepos">,
  archived: boolean,
  newest?: number,
): Promise<Doc<"sessions">[]> {
  const current = db
    .query("sessions")
    .withIndex("by_repo_deleted_and_archived_at", (q) => {
      const notDeleted = q.eq("repoId", repoId).eq("deletedAt", undefined);
      return archived
        ? notDeleted.gte("archive.archivedAt", 0)
        : notDeleted.eq("archive.archivedAt", undefined);
    });
  const legacy = db
    .query("sessions")
    .withIndex("by_repo_archived_and_deleted", (q) =>
      q.eq("repoId", repoId).eq("archived", true).eq("deletedAt", undefined),
    );
  const [rows, legacyRows] = await Promise.all([
    newest === undefined ? current.collect() : current.order("desc").take(newest),
    !archived
      ? []
      : newest === undefined
        ? legacy.collect()
        : legacy.order("desc").take(newest),
  ]);
  return [...rows, ...legacyRows].filter(
    (session) => isSessionArchived(session) === archived,
  );
}
