import { v, type Infer } from "convex/values";
import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
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

/**
 * streamingActivity entityId for sandbox startup progress. These strings are
 * persisted and subscribed to by apps/web (SessionDetailClient.tsx,
 * useTaskDetail.tsx, useProjectSandbox.ts); do not change them.
 */
export function sandboxStartupEntityId(owner: SandboxOwner): string {
  if (owner.kind === "session") return `session-startup-${owner.sessionId}`;
  if (owner.kind === "task") return `task-sandbox-startup-${owner.taskId}`;
  return `project-sandbox-startup-${owner.projectId}`;
}

/**
 * Reverse lookup: which entity owns `sandboxId`. Sessions first, then projects,
 * then quick tasks — the same order `sandboxHeal.isBoundToRepo` always used.
 * Unauthenticated by design: callers are internal (sweeps, HTTP heartbeats).
 */
export async function findSandboxOwnerBySandboxId(
  db: GenericDatabaseReader<DataModel>,
  sandboxId: string,
): Promise<ResolvedSandboxOwner | null> {
  const session = await db
    .query("sessions")
    .withIndex("by_sandbox", (q) => q.eq("sandboxId", sandboxId))
    .first();
  if (session) {
    return {
      kind: "session",
      ownerKey: sandboxOwnerKey({ kind: "session", sessionId: session._id }),
      doc: session,
    };
  }

  const project = await db
    .query("projects")
    .withIndex("by_sandbox", (q) => q.eq("sandboxId", sandboxId))
    .first();
  if (project) {
    return {
      kind: "project",
      ownerKey: sandboxOwnerKey({ kind: "project", projectId: project._id }),
      doc: project,
    };
  }

  const task = await db
    .query("agentTasks")
    .withIndex("by_sandbox", (q) => q.eq("sandboxId", sandboxId))
    .first();
  if (task) {
    return {
      kind: "task",
      ownerKey: sandboxOwnerKey({ kind: "task", taskId: task._id }),
      doc: task,
    };
  }
  return null;
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

/** Like `resolveSandboxOwnerForUser`, but a missing or forbidden owner throws. */
export async function resolveSandboxOwnerOrThrow(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  owner: SandboxOwner,
): Promise<ResolvedSandboxOwner> {
  const resolved = await resolveSandboxOwnerForUser(db, userId, owner);
  if (!resolved) throw new Error("Sandbox owner not found");
  return resolved;
}

/** Fields every sandbox owner table declares, so one patch fits all three. */
type SandboxOwnerPatch = Partial<
  Pick<
    Doc<"sessions">,
    | "terminalPanes"
    | "previewPath"
    | "devPort"
    | "terminalHistoryTail"
    | "agentBrowsingAt"
    | "updatedAt"
    | "sandboxBranch"
  >
>;

/** The one place that narrows a resolved owner back to its table for db.patch. */
export async function patchSandboxOwner(
  db: GenericDatabaseWriter<DataModel>,
  owner: ResolvedSandboxOwner,
  fields: SandboxOwnerPatch,
): Promise<void> {
  if (owner.kind === "session") await db.patch(owner.doc._id, fields);
  else if (owner.kind === "task") await db.patch(owner.doc._id, fields);
  else await db.patch(owner.doc._id, fields);
}
