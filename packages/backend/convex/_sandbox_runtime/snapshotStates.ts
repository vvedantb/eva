/**
 * Snapshot lifecycle states the build workflow polls for: "ready" is success,
 * "error" is failure, "pending" is still capturing (or not registered yet).
 *
 * This module is intentionally dependency-free. The snapshot SDK service
 * (snapshots.ts) is node-only and cannot be imported by the build workflow,
 * which runs in the Convex isolate — so the shared definition lives here where
 * both sides can import it.
 */
export type SnapshotState = "ready" | "pending" | "error";

export function isTerminalSnapshotState(state: SnapshotState): boolean {
  return state !== "pending";
}
