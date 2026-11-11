import type { SandboxOwner } from "@eva/backend";

/**
 * Per-owner key for a sandbox's PTYs, panes and dev-server consoles:
 * `session-<id>`, `task-<id>` or `project-<id>`.
 */
export function sandboxOwnerKey(owner: SandboxOwner): string {
  if (owner.kind === "session") return `session-${owner.sessionId}`;
  if (owner.kind === "task") return `task-${owner.taskId}`;
  return `project-${owner.projectId}`;
}

/**
 * streamingActivity entityId prefix for sandbox startup progress. The backend
 * stores these rows and apps/web subscribes to them; do not change them.
 */
export const SANDBOX_STARTUP_PREFIX = {
  session: "session-startup-",
  task: "task-sandbox-startup-",
  project: "project-sandbox-startup-",
} as const satisfies Record<SandboxOwner["kind"], string>;

/** streamingActivity entityId for one owner's sandbox startup progress. */
export function sandboxStartupEntityId(owner: SandboxOwner): string {
  if (owner.kind === "session") {
    return `${SANDBOX_STARTUP_PREFIX.session}${owner.sessionId}`;
  }
  if (owner.kind === "task") {
    return `${SANDBOX_STARTUP_PREFIX.task}${owner.taskId}`;
  }
  return `${SANDBOX_STARTUP_PREFIX.project}${owner.projectId}`;
}
