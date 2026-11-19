import { ConvexError, v } from "convex/values";
import { MAINTENANCE_ERROR } from "@eva/shared";
import { query } from "./_generated/server";

/**
 * Maintenance mode: while the `MAINTENANCE` env var is "1", every user-facing
 * call (the `auth*` wrappers and the MCP endpoint) is refused, and the web app
 * shows a maintenance screen. Internal functions keep running, so
 * `npx convex run` migrations still work.
 *
 *   npx convex env set MAINTENANCE 1     # on
 *   npx convex env remove MAINTENANCE    # off
 */
export function isMaintenanceMode(): boolean {
  return process.env.MAINTENANCE === "1";
}

export function assertNotInMaintenance(): void {
  if (isMaintenanceMode()) throw new ConvexError(MAINTENANCE_ERROR);
}

/** Public and unauthenticated: the web app subscribes to this to show its maintenance screen. */
export const status = query({
  args: {},
  returns: v.boolean(),
  handler: async () => isMaintenanceMode(),
});
