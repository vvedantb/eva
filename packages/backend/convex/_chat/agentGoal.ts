import { v } from "convex/values";
import {
  agentGoalValidator,
  type AgentGoal,
} from "../_validators/tableFields";

/** Daemon `updateGoal` argument: the chat's goal now, or null once cleared. */
export const agentGoalArg = v.union(agentGoalValidator, v.null());

function sameGoal(a: AgentGoal, b: AgentGoal): boolean {
  return (
    a.objective === b.objective &&
    a.status === b.status &&
    a.checks === b.checks &&
    a.lastCheck === b.lastCheck
  );
}

/**
 * The patch a daemon goal report needs, or null when the stored goal already
 * matches. The daemon dedupes too; this guards a daemon restart re-reporting.
 */
export function agentGoalPatch(
  current: AgentGoal | undefined,
  next: AgentGoal | null,
): { goal: AgentGoal | undefined } | null {
  if (next === null) return current === undefined ? null : { goal: undefined };
  if (current !== undefined && sameGoal(current, next)) return null;
  return { goal: next };
}
