import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { hasRepoAccess } from "../functions";
import { hasCodebaseRepoAccess } from "../_githubRepos/helpers";

/**
 * Read/comment rule: PR recaps follow the codebase rule (any sibling repo);
 * other docs need their own repo.
 */
export async function canAccessDoc(
  db: GenericDatabaseReader<DataModel>,
  doc: Pick<Doc<"docs">, "repoId" | "kind">,
  userId: Id<"users">,
): Promise<boolean> {
  if (doc.kind === "pr-recap") {
    return hasCodebaseRepoAccess(db, doc.repoId, userId);
  }
  return hasRepoAccess(db, doc.repoId, userId);
}

/** Loads a doc under `canAccessDoc`, or null when it is missing or not accessible. */
export async function findDocWithAccess(
  db: GenericDatabaseReader<DataModel>,
  docId: Id<"docs">,
  userId: Id<"users">,
): Promise<Doc<"docs"> | null> {
  const doc = await db.get(docId);
  if (!doc || !(await canAccessDoc(db, doc, userId))) return null;
  return doc;
}

/**
 * Loads a doc and throws unless the user can access the doc's own repo.
 * Stricter than `canAccessDoc`: PR recaps get no codebase-wide access here.
 */
export async function getDocWithAccess(
  db: GenericDatabaseReader<DataModel>,
  docId: Id<"docs">,
  userId: Id<"users">,
): Promise<Doc<"docs">> {
  const doc = await db.get(docId);
  if (!doc) throw new Error("Doc not found");
  if (!(await hasRepoAccess(db, doc.repoId, userId))) {
    throw new Error("Not authorized");
  }
  return doc;
}
