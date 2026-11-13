import type { SandboxOwner } from "@eva/backend";

/** Per-owner key for a sandbox's PTYs, panes and dev-server consoles: `session-<id>`. */
export function sandboxOwnerKey(owner: SandboxOwner): string {
  return `session-${owner.sessionId}`;
}

/**
 * streamingActivity entityId prefix for sandbox startup progress. The backend
 * stores these rows and apps/web subscribes to them; do not change them.
 */
export const SANDBOX_STARTUP_PREFIX = {
  session: "session-startup-",
} as const satisfies Record<SandboxOwner["kind"], string>;

/** streamingActivity entityId for one owner's sandbox startup progress. */
export function sandboxStartupEntityId(owner: SandboxOwner): string {
  return `${SANDBOX_STARTUP_PREFIX.session}${owner.sessionId}`;
}
