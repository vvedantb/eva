import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { findRepoEnvVarDoc } from "./_envVars/documentStore";

type Ctx = { db: GenericDatabaseReader<DataModel> };

/** Checks whether any table in the system still references the given repo. */
export async function hasRepoReferences(
  ctx: Ctx,
  repoId: Id<"githubRepos">,
): Promise<boolean> {
  const checks = [
    ctx.db
      .query("sessions")
      .withIndex("by_repo", (q) => q.eq("repoId", repoId))
      .first(),
    ctx.db
      .query("projects")
      .withIndex("by_repo", (q) => q.eq("repoId", repoId))
      .first(),
    ctx.db
      .query("docs")
      .withIndex("by_repo", (q) => q.eq("repoId", repoId))
      .first(),
    ctx.db
      .query("evaluationReports")
      .withIndex("by_repo", (q) => q.eq("repoId", repoId))
      .first(),
    findRepoEnvVarDoc(ctx.db, repoId),
    ctx.db
      .query("repoSnapshots")
      .withIndex("by_repo", (q) => q.eq("repoId", repoId))
      .first(),
    ctx.db
      .query("agentTasks")
      .withIndex("by_repo", (q) => q.eq("repoId", repoId))
      .first(),
    ctx.db
      .query("notifications")
      .withIndex("by_repo", (q) => q.eq("repoId", repoId))
      .first(),
  ];

  const results = await Promise.all(checks);
  return results.some((r) => r !== null);
}

/** Trims and strips leading/trailing slashes from a path, returning undefined for empty strings. */
export function normalizePath(p: string): string | undefined {
  const trimmed = p.trim().replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? undefined : trimmed;
}
