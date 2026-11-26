import type { Infer } from "convex/values";
import { parseAppHref, type AppLinkTarget } from "@eva/shared/appHref";
import { parseEvaEntityLink } from "@eva/shared";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { hasRepoAccess, isTaskVisibleTo } from "../functions";
import { entityVisible } from "../numId";
import { findRepoByPath } from "../_githubRepos/helpers";
import type { avePageEntityValidator } from "../_validators/tableFields";

export type AvePageEntity = Infer<typeof avePageEntityValidator>;

type EntityTarget = Exclude<AppLinkTarget, { kind: "review" }>;

/**
 * Looks up what `path` shows, as `ave.send` sees it, with the same repo access
 * and visibility rules as the chat link hover cards (`_mentions/listData.ts`).
 * Null for pages that show no one entity (Home, a list, settings) or that
 * the user cannot read.
 */
export async function resolvePageEntity(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  path: string,
): Promise<AvePageEntity | null> {
  const link = parseEvaEntityLink(path, "");
  const target = parseAppHref(path);
  if (link === null || target === null || target.kind === "review") {
    return null;
  }
  const repo = await findRepoByPath(db, link);
  if (!repo || !(await hasRepoAccess(db, repo._id, userId))) return null;
  // A project task page names the task; fall back to its project when the
  // task lives in another repo.
  return (
    (await findEntity(db, userId, repo._id, target)) ??
    (target.kind === "task" && link.section === "projects"
      ? findEntity(db, userId, repo._id, { kind: "project", numId: link.numId })
      : null)
  );
}

async function findEntity(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  repoId: Id<"githubRepos">,
  target: EntityTarget,
): Promise<AvePageEntity | null> {
  switch (target.kind) {
    case "session": {
      const row = entityVisible(
        await db
          .query("sessions")
          .withIndex("by_repo_and_numId", (q) =>
            q.eq("repoId", repoId).eq("numId", target.numId),
          )
          .first(),
      );
      return row && { kind: "session", title: row.title, status: row.status };
    }
    case "task": {
      const row = await db
        .query("agentTasks")
        .withIndex("by_repo_and_numId", (q) =>
          q.eq("repoId", repoId).eq("numId", target.numId),
        )
        .first();
      return row && isTaskVisibleTo(row, userId)
        ? { kind: "quick task", title: row.title, status: row.status }
        : null;
    }
    case "project": {
      // An archived project still opens by URL, so it still resolves.
      const row = await db
        .query("projects")
        .withIndex("by_repo_and_numId", (q) =>
          q.eq("repoId", repoId).eq("numId", target.numId),
        )
        .first();
      return row && { kind: "project", title: row.title };
    }
    case "doc": {
      const row = entityVisible(
        await db
          .query("docs")
          .withIndex("by_repo_and_numId", (q) =>
            q.eq("repoId", repoId).eq("numId", target.numId),
          )
          .first(),
      );
      return row && { kind: "doc", title: row.title };
    }
  }
}
