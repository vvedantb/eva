import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { hasRepoAccess } from "../functions";
import { resolveCanonicalRepoId } from "../_githubRepos/helpers";
import { filterActiveEntities } from "../numId";
import { resolveAutomationDoc } from "./systemAutomations";

export { buildAutomationRunBranchName } from "../_git/branchNames";

/** Loads an automation, throwing unless the user can access its repo. */
export async function getAutomationWithAccess(
  db: GenericDatabaseReader<DataModel>,
  automationId: Id<"automations">,
  userId: Id<"users">,
): Promise<Doc<"automations">> {
  const automation = await db.get(automationId);
  if (!automation) throw new Error("Automation not found");
  if (!(await hasRepoAccess(db, automation.repoId, userId))) {
    throw new Error("Not authorized");
  }
  return automation;
}

/** Loads a run and its automation, throwing unless the user can access the repo. */
export async function loadRunWithAccess(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  runId: Id<"automationRuns">,
): Promise<{ run: Doc<"automationRuns">; automation: Doc<"automations"> }> {
  const run = await db.get(runId);
  if (!run) throw new Error("Run not found");
  const automation = await getAutomationWithAccess(
    db,
    run.automationId,
    userId,
  );
  return { run, automation };
}

/**
 * Lists automations visible for a repo: app-specific plus shared monorepo
 * automations. System installs come back with their catalog definition applied.
 */
export async function listAutomationsForRepo(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<Array<Doc<"automations">>> {
  const canonicalId = await resolveCanonicalRepoId(db, repoId);

  const localAutomations = await db
    .query("automations")
    .withIndex("by_repo", (q) => q.eq("repoId", repoId))
    .collect();

  if (canonicalId === repoId) {
    return filterActiveEntities(localAutomations).map(resolveAutomationDoc);
  }

  const appAutomations = filterActiveEntities(localAutomations).filter(
    (automation) => automation.shared !== true,
  );

  const canonicalAutomations = await db
    .query("automations")
    .withIndex("by_repo", (q) => q.eq("repoId", canonicalId))
    .collect();

  const sharedAutomations = filterActiveEntities(canonicalAutomations).filter(
    (automation) => automation.shared === true,
  );

  return [...sharedAutomations, ...appAutomations].map(resolveAutomationDoc);
}

/** Resolves repoId storage for an automation when toggling shared scope. */
export async function resolveAutomationRepoId(
  db: GenericDatabaseReader<DataModel>,
  contextRepoId: Id<"githubRepos">,
  shared: boolean,
): Promise<Id<"githubRepos">> {
  if (shared) {
    return resolveCanonicalRepoId(db, contextRepoId);
  }
  return contextRepoId;
}
