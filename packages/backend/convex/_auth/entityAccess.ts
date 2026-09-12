import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import {
  getProjectWithAccess,
  getSessionWithAccess,
  getTaskWithAccess,
  hasRepoAccess,
  hasTaskAccess,
} from "../functions";
import { hasCodebaseRepoAccess } from "../_githubRepos/helpers";
import { isEntityDeleted } from "../numId";

const AUTOMATION_RUN_STREAM_PREFIX = "automation-run-";
const PR_RECAP_STREAM_PREFIX = "pr-recap:";

/** True when the user may read or write streaming/pending-question state for this id. */
export async function hasEntityAccess(
  db: GenericDatabaseReader<DataModel>,
  entityId: string,
  userId: Id<"users">,
): Promise<boolean> {
  try {
    await assertEntityAccess(db, entityId, userId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a streaming / pending-question / heartbeat entity id to a repo-backed
 * row and throws unless the caller can access that repo. Fail closed: unknown
 * prefixes and ids that do not normalize are denied.
 */
export async function assertEntityAccess(
  db: GenericDatabaseReader<DataModel>,
  entityId: string,
  userId: Id<"users">,
): Promise<void> {
  if (entityId.startsWith(AUTOMATION_RUN_STREAM_PREFIX)) {
    const runId = db.normalizeId(
      "automationRuns",
      entityId.slice(AUTOMATION_RUN_STREAM_PREFIX.length),
    );
    if (!runId) throw new Error("Not authorized");
    const run = await db.get(runId);
    if (!run || !(await hasRepoAccess(db, run.repoId, userId))) {
      throw new Error("Not authorized");
    }
    return;
  }

  if (entityId.startsWith(PR_RECAP_STREAM_PREFIX)) {
    const docId = db.normalizeId(
      "docs",
      entityId.slice(PR_RECAP_STREAM_PREFIX.length),
    );
    if (!docId) throw new Error("Not authorized");
    await assertDocAccess(db, docId, userId);
    return;
  }

  const sessionId = db.normalizeId("sessions", entityId);
  if (sessionId) {
    await getSessionWithAccess(db, sessionId, userId);
    return;
  }

  const projectId = db.normalizeId("projects", entityId);
  if (projectId) {
    await getProjectWithAccess(db, projectId, userId);
    return;
  }

  const taskId = db.normalizeId("agentTasks", entityId);
  if (taskId) {
    await getTaskWithAccess(db, taskId, userId);
    return;
  }

  const docId = db.normalizeId("docs", entityId);
  if (docId) {
    await assertDocAccess(db, docId, userId);
    return;
  }

  const reportId = db.normalizeId("evaluationReports", entityId);
  if (reportId) {
    const report = await db.get(reportId);
    if (!report || !(await hasRepoAccess(db, report.repoId, userId))) {
      throw new Error("Not authorized");
    }
    return;
  }

  const runId = db.normalizeId("automationRuns", entityId);
  if (runId) {
    const run = await db.get(runId);
    if (!run || !(await hasRepoAccess(db, run.repoId, userId))) {
      throw new Error("Not authorized");
    }
    return;
  }

  const automationId = db.normalizeId("automations", entityId);
  if (automationId) {
    const automation = await db.get(automationId);
    if (!automation || !(await hasRepoAccess(db, automation.repoId, userId))) {
      throw new Error("Not authorized");
    }
    return;
  }

  throw new Error("Not authorized");
}

/** Same repo / codebase rules as `docs.get`. */
export async function assertDocAccess(
  db: GenericDatabaseReader<DataModel>,
  docId: Id<"docs">,
  userId: Id<"users">,
): Promise<Doc<"docs">> {
  const doc = await db.get(docId);
  if (!doc) throw new Error("Doc not found");
  if (isEntityDeleted(doc)) throw new Error("Not authorized");
  if (doc.kind === "pr-recap") {
    if (!(await hasCodebaseRepoAccess(db, doc.repoId, userId))) {
      throw new Error("Not authorized");
    }
    return doc;
  }
  if (!(await hasRepoAccess(db, doc.repoId, userId))) {
    throw new Error("Not authorized");
  }
  return doc;
}

/** True when `targetUserId` is the caller or shares a team with them. */
export async function isDirectoryPeer(
  db: GenericDatabaseReader<DataModel>,
  callerId: Id<"users">,
  targetUserId: Id<"users">,
): Promise<boolean> {
  if (callerId === targetUserId) return true;
  const memberships = await db
    .query("teamMembers")
    .withIndex("by_user", (q) => q.eq("userId", callerId))
    .collect();
  for (const membership of memberships) {
    const peer = await db
      .query("teamMembers")
      .withIndex("by_team_and_user", (q) =>
        q.eq("teamId", membership.teamId).eq("userId", targetUserId),
      )
      .first();
    if (peer) return true;
  }
  return false;
}

export { hasTaskAccess };
