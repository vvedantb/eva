import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";

export type RepoEntityType =
  | "sessions"
  | "docs"
  | "projects"
  | "agentTasks"
  | "automations";

/**
 * True when a session, doc or automation was soft-deleted and should be hidden
 * / 404 in the UI. Tasks and projects are never deleted: `archivedAt` marks
 * them (`isEntityArchived`), so the `archivedAt?: never` rejects them here.
 */
export function isEntityDeleted(doc: {
  deletedAt?: number;
  archivedAt?: never;
}): boolean {
  return doc.deletedAt !== undefined;
}

/** True when a task or project is archived: hidden from lists, still opens by URL. */
export function isEntityArchived(doc: { archivedAt?: number }): boolean {
  return doc.archivedAt !== undefined;
}

/** Omits archived tasks or projects from list results. */
export function filterUnarchived<T extends { archivedAt?: number }>(
  items: readonly T[],
): T[] {
  return items.filter((item) => !isEntityArchived(item));
}

/**
 * Ids of a repo's archived projects. A project archives as one unit: lists
 * that show tasks drop the tasks of these projects too.
 */
export async function archivedProjectIds(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<Set<string>> {
  const projects = await db
    .query("projects")
    .withIndex("by_repo_and_archived", (q) =>
      q.eq("repoId", repoId).gte("archivedAt", 0),
    )
    .collect();
  return new Set(projects.map((project) => String(project._id)));
}

/** Live tasks: not archived and not in an archived project (`archivedProjectIds`). */
export function filterLiveTasks<
  T extends { archivedAt?: number; projectId?: Id<"projects"> },
>(tasks: readonly T[], archivedProjects: ReadonlySet<string>): T[] {
  return tasks.filter(
    (task) =>
      !isEntityArchived(task) &&
      (task.projectId === undefined ||
        !archivedProjects.has(String(task.projectId))),
  );
}

/**
 * Atomically allocates the next per-repo numId for an entity type.
 * Must run in the same mutation as the entity insert.
 */
export async function allocateNumId(
  db: GenericDatabaseWriter<DataModel>,
  repoId: Id<"githubRepos">,
  entityType: RepoEntityType,
): Promise<number> {
  const counter = await db
    .query("repoEntityCounters")
    .withIndex("by_repo_and_type", (q) =>
      q.eq("repoId", repoId).eq("entityType", entityType),
    )
    .first();

  if (counter) {
    const numId = counter.nextNumId;
    await db.patch(counter._id, { nextNumId: numId + 1 });
    return numId;
  }

  await db.insert("repoEntityCounters", {
    repoId,
    entityType,
    nextNumId: 2,
  });
  return 1;
}

/** Shared lookup for getByNumId queries — returns null when deleted or missing. */
export function entityVisible<
  T extends { deletedAt?: number; archivedAt?: never },
>(
  doc: T | null,
): T | null {
  if (!doc || isEntityDeleted(doc)) return null;
  return doc;
}

/** Omits soft-deleted rows from list results. */
export function filterActiveEntities<
  T extends { deletedAt?: number; archivedAt?: never },
>(
  items: readonly T[],
): T[] {
  return items.filter((item) => !isEntityDeleted(item));
}
