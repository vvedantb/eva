import type { Doc } from "../_generated/dataModel";

/** Success, error and cancelled are final for an automation run. */
export function isTerminalRunStatus(
  status: Doc<"automationRuns">["status"],
): boolean {
  return status === "success" || status === "error" || status === "cancelled";
}
