import { ConvexError } from "convex/values";

/**
 * `ConvexError` data the backend throws from every user-facing call while
 * maintenance mode is on (`npx convex env set MAINTENANCE 1`). A plain `Error`
 * would reach prod clients as a redacted "Server Error", so clients could not
 * tell maintenance from a crash.
 */
export const MAINTENANCE_ERROR = "EVA_MAINTENANCE";

/** True when `error` is the backend's maintenance-mode rejection. */
export function isMaintenanceError(error: Error): boolean {
  return error instanceof ConvexError && error.data === MAINTENANCE_ERROR;
}
