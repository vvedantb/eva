import type { AgentGoal } from "@eva/backend";

/**
 * Claude's native `/goal` banner above the composer (web and phone
 * `GoalBanner`): the copy both apps show.
 */

/** Claude's own command; the daemon clears the banner when Claude confirms. */
export const CLEAR_GOAL_COMMAND = "/goal clear";

export function goalStatusLabel(goal: AgentGoal): string {
  return goal.status === "complete" ? "Met" : "Active";
}

export function goalDetail(goal: AgentGoal): string {
  if (goal.status === "complete") return "Claude judged this goal met.";
  if (goal.checks === 0) return "Claude keeps working until this is met.";
  const times = goal.checks === 1 ? "1 time" : `${goal.checks} times`;
  return goal.lastCheck
    ? `Not met after ${times}: ${goal.lastCheck}`
    : `Not met after ${times}.`;
}
