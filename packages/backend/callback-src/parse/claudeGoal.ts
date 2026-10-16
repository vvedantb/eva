import type { JsonObject, JsonValue } from "../types.js";

/**
 * Claude's native `/goal`, read back out of the Agent SDK stream.
 *
 * WHY TEXT: SDK 0.3.282 / CLI 2.1.282 has a structured `active_goal` frame
 * (`SDKActiveGoalMessage` in sdk.d.ts), but the CLI only writes it to stdout
 * when `CLAUDE_CODE_REMOTE` is set. That flag switches the CLI into its cloud
 * mode (it changes permissions, memory, auth and Bash timeouts), so Eva does
 * not set it. Without it the goal is visible only as transcript text.
 *
 * THIS DEPENDS ON CLAUDE'S WORDING. The exact strings, all from root frames
 * (`parent_tool_use_id` null), as of CLI 2.1.282:
 *
 * - Assistant, `message.model === "<synthetic>"` (the `/goal` command output):
 *   - `Goal set: <condition>`
 *   - `Goal active: <condition> (not yet evaluated)` or `(<n> turn[s])`,
 *     optionally followed by `\nLast check: <reason>`
 *   - `Goal cleared: <condition>`, `No goal set`, or
 *     `No goal set. Usage: \`/goal <condition>\``
 * - User, `isSynthetic: true` (the goal's Stop hook said "not met"):
 *   `Stop hook feedback:\n[<condition>]: <reason>`. Claude shortens the
 *   bracketed condition to 500 characters after its first appearance.
 * - System `informational`:
 *   `Goal cleared after an unrecoverable error (<label>): "<condition>"…`
 *
 * "Goal met" has no frame of its own. `goalAfterTurn` infers it: Claude ends a
 * turn by itself only after the goal's Stop hook passes.
 *
 * Fail safe: anything that does not match exactly leaves the goal unchanged
 * (`undefined`), so a reworded CLI shows no new banner rather than a wrong one.
 */

export type ClaudeGoal = {
  objective: string;
  status: "active" | "complete";
  /** Stop hook evaluations that said "not met yet". */
  checks: number;
  /** The evaluator's latest "not met" reason. */
  lastCheck?: string;
};

const GOAL_SET_PREFIX = "Goal set: ";
const GOAL_CLEARED_PREFIX = "Goal cleared: ";
const NO_GOAL_SET = "No goal set";
const GOAL_ACTIVE = /^Goal active: ([\s\S]+?) \((?:not yet evaluated|(\d+) turns?)\)/;
const STOP_HOOK_FEEDBACK_PREFIX = "Stop hook feedback:\n[";
const UNRECOVERABLE_CLEAR_PREFIX = "Goal cleared after an unrecoverable error";
/** Claude truncates the repeated condition in Stop hook feedback to this. */
const FEEDBACK_CONDITION_LIMIT = 500;
/** Keeps a chatty evaluator reason from bloating the chat document. */
const LAST_CHECK_LIMIT = 500;

function textOf(content: JsonValue | undefined): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const part of content) {
    if (
      typeof part === "object" &&
      part !== null &&
      !Array.isArray(part) &&
      part.type === "text" &&
      typeof part.text === "string"
    ) {
      text += part.text;
    }
  }
  return text;
}

function isRootFrame(message: JsonObject): boolean {
  const parent = message.parent_tool_use_id;
  return parent === undefined || parent === null;
}

function assistantModel(message: JsonObject): string | undefined {
  const inner = message.message;
  if (typeof inner !== "object" || inner === null || Array.isArray(inner)) {
    return undefined;
  }
  return typeof inner.model === "string" ? inner.model : undefined;
}

function messageContent(message: JsonObject): JsonValue | undefined {
  const inner = message.message;
  if (typeof inner !== "object" || inner === null || Array.isArray(inner)) {
    return undefined;
  }
  return inner.content;
}

/** True for a root assistant frame the model wrote (not command output). */
export function isGoalWorkFrame(message: JsonObject): boolean {
  if (message.type !== "assistant" || !isRootFrame(message)) return false;
  const model = assistantModel(message);
  return model !== undefined && model !== "<synthetic>";
}

/** The "not met" reason when `text` is Stop hook feedback for `objective`. */
function stopHookReason(text: string, objective: string): string | undefined {
  if (!text.startsWith(STOP_HOOK_FEEDBACK_PREFIX)) return undefined;
  const rest = text.slice(STOP_HOOK_FEEDBACK_PREFIX.length);
  const full = objective + "]: ";
  if (rest.startsWith(full)) return rest.slice(full.length).trim();
  if (objective.length <= FEEDBACK_CONDITION_LIMIT) return undefined;
  // Shortened condition: match its head, then the first `]: ` after it.
  const head = objective.slice(0, FEEDBACK_CONDITION_LIMIT - 100);
  if (!rest.startsWith(head)) return undefined;
  const end = rest.indexOf("]: ", head.length);
  return end === -1 ? undefined : rest.slice(end + 3).trim();
}

/**
 * The goal after one SDK frame: a new goal, `null` when it was cleared, or
 * `undefined` when the frame says nothing about it (including unknown text).
 */
export function nextClaudeGoal(
  current: ClaudeGoal | null,
  message: JsonObject,
): ClaudeGoal | null | undefined {
  if (!isRootFrame(message)) return undefined;

  if (message.type === "assistant") {
    if (assistantModel(message) !== "<synthetic>") return undefined;
    const text = textOf(messageContent(message)).trim();
    if (text.startsWith(GOAL_SET_PREFIX)) {
      const objective = text.slice(GOAL_SET_PREFIX.length).trim();
      return objective ? { objective, status: "active", checks: 0 } : undefined;
    }
    if (text.startsWith(GOAL_CLEARED_PREFIX)) return null;
    if (text === NO_GOAL_SET || text.startsWith(NO_GOAL_SET + ". ")) {
      return null;
    }
    const active = GOAL_ACTIVE.exec(text);
    const objective = active?.[1];
    if (objective === undefined) return undefined;
    const sameGoal = current?.objective === objective;
    return {
      objective,
      status: "active",
      checks: Number(active?.[2] ?? 0),
      ...(sameGoal && current?.lastCheck !== undefined
        ? { lastCheck: current.lastCheck }
        : {}),
    };
  }

  if (message.type === "system" && message.subtype === "informational") {
    const content = message.content;
    return typeof content === "string" &&
      content.startsWith(UNRECOVERABLE_CLEAR_PREFIX)
      ? null
      : undefined;
  }

  if (
    message.type === "user" &&
    message.isSynthetic === true &&
    current?.status === "active"
  ) {
    const reason = stopHookReason(
      textOf(messageContent(message)),
      current.objective,
    );
    if (reason === undefined) return undefined;
    return {
      ...current,
      checks: current.checks + 1,
      ...(reason ? { lastCheck: reason.slice(0, LAST_CHECK_LIMIT) } : {}),
    };
  }

  return undefined;
}

/**
 * The goal once a turn's `result` lands. While a goal is active, Claude ends a
 * turn on its own only after the goal's Stop hook passes, so a clean end of a
 * turn the model worked in means "met". It defers the check while background
 * work runs, and an error or interrupt is not a pass, so those keep it active.
 *
 * Known gap (same as Claude's own SDK mode): an evaluator timeout or an
 * "impossible" verdict also ends the turn cleanly and so reads as complete.
 */
export function goalAfterTurn(
  current: ClaudeGoal | null,
  turn: {
    modelWorked: boolean;
    endedCleanly: boolean;
    backgroundWorkRunning: boolean;
  },
): ClaudeGoal | null {
  if (
    current?.status !== "active" ||
    !turn.modelWorked ||
    !turn.endedCleanly ||
    turn.backgroundWorkRunning
  ) {
    return current;
  }
  return {
    objective: current.objective,
    status: "complete",
    checks: current.checks,
  };
}

/** True when a `result` frame reports a normal, error-free turn end. */
export function isCleanTurnEnd(result: JsonObject): boolean {
  if (result.type !== "result") return false;
  if (result.subtype !== "success" || result.is_error === true) return false;
  const reason = result.terminal_reason;
  return reason === undefined || reason === null || reason === "completed";
}

export function sameGoal(a: ClaudeGoal | null, b: ClaudeGoal | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.objective === b.objective &&
    a.status === b.status &&
    a.checks === b.checks &&
    a.lastCheck === b.lastCheck
  );
}
