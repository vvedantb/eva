import { v, type Infer } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { hasRepoAccess, hasTaskAccess } from "../functions";

/**
 * One sandbox owner contract shared by view state, PTYs, panes, and runtime
 * APIs. A sandbox belongs to a session, a quick task, or a project, and the
 * backend resolves the sandbox and repo from whichever is provided.
 */
export const sandboxOwnerValidator = v.union(
  v.object({
    kind: v.literal("session"),
    sessionId: v.id("sessions"),
  }),
  v.object({
    kind: v.literal("task"),
    taskId: v.id("agentTasks"),
  }),
  v.object({
    kind: v.literal("project"),
    projectId: v.id("projects"),
  }),
);

export type SandboxOwner = Infer<typeof sandboxOwnerValidator>;

export type ResolvedSandboxOwner =
  | {
      kind: "session";
      ownerKey: string;
      doc: Doc<"sessions">;
    }
  | {
      kind: "task";
      ownerKey: string;
      doc: Doc<"agentTasks">;
    }
  | {
      kind: "project";
      ownerKey: string;
      doc: Doc<"projects">;
    };

export function sandboxOwnerKey(owner: SandboxOwner): string {
  if (owner.kind === "session") return `session-${owner.sessionId}`;
  if (owner.kind === "task") return `task-${owner.taskId}`;
  return `project-${owner.projectId}`;
}

/** Resolves and authorizes any sandbox owner without duplicating table policy. */
export async function resolveSandboxOwnerForUser(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  owner: SandboxOwner,
): Promise<ResolvedSandboxOwner | null> {
  if (owner.kind === "session") {
    const session = await db.get(owner.sessionId);
    if (!session || !(await hasRepoAccess(db, session.repoId, userId))) {
      return null;
    }
    return {
      kind: "session",
      ownerKey: sandboxOwnerKey(owner),
      doc: session,
    };
  }

  if (owner.kind === "task") {
    const task = await db.get(owner.taskId);
    if (!task || !(await hasTaskAccess(db, task, userId))) return null;
    return {
      kind: "task",
      ownerKey: sandboxOwnerKey(owner),
      doc: task,
    };
  }

  const project = await db.get(owner.projectId);
  if (!project || !(await hasRepoAccess(db, project.repoId, userId))) {
    return null;
  }
  return {
    kind: "project",
    ownerKey: sandboxOwnerKey(owner),
    doc: project,
  };
}
