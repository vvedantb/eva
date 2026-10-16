import { ENTITY_ID, ENTITY_ID_FIELD, UPDATE_GOAL_MUTATION } from "../config.js";
import { callConvexWithRetry } from "../http/convexClient.js";
import {
  goalAfterTurn,
  isCleanTurnEnd,
  isGoalWorkFrame,
  nextClaudeGoal,
  sameGoal,
  type ClaudeGoal,
} from "../parse/claudeGoal.js";
import { buildEntityMutationArgs } from "../runtime/daemonProcess.js";
import type { JsonObject, JsonValue } from "../types.js";
import { log } from "../utils.js";
import { isZeroWorkTaskNotificationResult } from "./claudeResult.js";

/**
 * The warm daemon's view of Claude's native `/goal`, mirrored onto the chat
 * doc through UPDATE_GOAL_MUTATION. Starts unknown (null) on every daemon
 * boot: a goal stored before a restart stays shown until the next goal frame,
 * and `/goal clear` replies "No goal set", which clears it either way.
 */
let goal: ClaudeGoal | null = null;
let modelWorkedThisTurn = false;
/** Size of the SDK's latest `background_tasks_changed` roster (agents + shells). */
let backgroundTaskCount = 0;

/** Writes run one at a time, so a quick set → complete cannot land reversed. */
let writeChain: Promise<void> = Promise.resolve();

function goalJson(value: ClaudeGoal | null): JsonValue {
  if (value === null) return null;
  return {
    objective: value.objective,
    status: value.status,
    checks: value.checks,
    ...(value.lastCheck === undefined ? {} : { lastCheck: value.lastCheck }),
  };
}

function setGoal(next: ClaudeGoal | null): void {
  if (sameGoal(goal, next)) return;
  goal = next;
  const mutation = UPDATE_GOAL_MUTATION;
  if (!mutation) return;
  log("daemon: goal " + (next === null ? "cleared" : next.status));
  const args = buildEntityMutationArgs(ENTITY_ID_FIELD, ENTITY_ID, {
    goal: goalJson(next),
  });
  writeChain = writeChain
    .then(async () => {
      await callConvexWithRetry("mutation", mutation, args);
    })
    .catch(() => {
      /* best-effort: the banner is advisory, the turn must not depend on it */
    });
}

/** Feeds one SDK frame (every frame, any turn kind) to the goal tracker. */
export function trackClaudeGoalFrame(message: JsonObject): void {
  if (
    message.type === "system" &&
    message.subtype === "background_tasks_changed" &&
    Array.isArray(message.tasks)
  ) {
    backgroundTaskCount = message.tasks.length;
  }
  if (isGoalWorkFrame(message)) modelWorkedThisTurn = true;
  const next = nextClaudeGoal(goal, message);
  if (next !== undefined) setGoal(next);
  // A zero-work task-notification result is a stream boundary, not a turn end.
  if (message.type !== "result" || isZeroWorkTaskNotificationResult(message)) {
    return;
  }
  setGoal(
    goalAfterTurn(goal, {
      modelWorked: modelWorkedThisTurn,
      endedCleanly: isCleanTurnEnd(message),
      backgroundWorkRunning: backgroundTaskCount > 0,
    }),
  );
  modelWorkedThisTurn = false;
}
