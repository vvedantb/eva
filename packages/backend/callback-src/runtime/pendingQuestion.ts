import {
  BLOCKING_QUESTIONS_ENABLED,
  CLAIM_MUTATION,
  ENTITY_ID,
} from "../config.js";
import { callConvexWithRetry } from "../http/convexClient.js";
import { callbackState as S } from "./state.js";
import type { JsonValue } from "../types.js";
import type { JsonLike, SdkCanUseTool } from "../providers/claudeSdk.js";
import { log } from "../utils.js";

// How often the paused turn polls Convex for the user's answer. Matches the
// daemon's turn-claim cadence — the model is idle while waiting, so this only
// adds at most one poll of latency once the answer lands.
const POLL_INTERVAL_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reads `.value.answer` (a JSON string, or null) out of a claimAnswer result.
 * Convex's `/api/mutation` wraps returns in `{ status, value }`, so the answer
 * lives under `.value`; falls back to the top level for an unwrapped value.
 */
function readClaimedAnswer(result: JsonValue): string | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return null;
  }
  const inner = result.value;
  const payload =
    typeof inner === "object" && inner !== null && !Array.isArray(inner)
      ? inner
      : result;
  const answer = payload.answer;
  return typeof answer === "string" ? answer : null;
}

/** Publishes the question so the UI can render it and collect an answer. */
async function postQuestion(toolUseId: string, payload: string): Promise<void> {
  await callConvexWithRetry("mutation", "pendingQuestions:post", {
    entityId: ENTITY_ID ?? "",
    toolUseId,
    payload,
  });
}

/** Polls until the user answers, or the turn is cancelled (signal aborts). */
async function pollForAnswer(
  toolUseId: string,
  signal: AbortSignal,
): Promise<string | null> {
  while (!signal.aborted) {
    const result = await callConvexWithRetry(
      "mutation",
      "pendingQuestions:claimAnswer",
      { entityId: ENTITY_ID ?? "", toolUseId },
    );
    const answer = readClaimedAnswer(result);
    if (answer !== null) return answer;
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

/** Parses the stored answer JSON into an object safe to merge into tool input. */
function parseAnswers(answerJson: string): Record<string, JsonLike> {
  try {
    const parsed: JsonLike = JSON.parse(answerJson);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed;
    }
  } catch {
    /* malformed answer — fall through to empty */
  }
  return {};
}

/**
 * Builds the SDK `canUseTool` gate used when blocking questions are enabled.
 * Every tool is auto-allowed EXCEPT AskUserQuestion, which posts the question to
 * Convex and blocks (no timeout) until the user answers — then returns the
 * answer as the tool's input so the model continues the SAME turn with a real
 * tool_result rather than the question ending the turn.
 */
export function buildCanUseTool(): SdkCanUseTool {
  return async (toolName, input, options) => {
    // Policy A: Bash may background (session panel tracks/kills it), but on
    // one-shot job runs (no CLAIM_MUTATION) Agent/Task sub-agents must stay
    // foreground so the SDK result still covers their work. Warm daemon chat
    // allows background. Named `Agent` since Claude Code v2.1.63; older CLIs
    // still emit `Task`.
    if (
      !CLAIM_MUTATION &&
      (toolName === "Agent" || toolName === "Task") &&
      input.run_in_background === true
    ) {
      return {
        behavior: "allow",
        updatedInput: { ...input, run_in_background: false },
      };
    }
    // Only sessions wire the answering UI. Everywhere else AskUserQuestion
    // stays fire-and-forget metadata (providers/claude.ts surfaces it after the
    // turn), so the gate allows it through rather than blocking on an answer
    // no one can give.
    if (toolName !== "AskUserQuestion" || !BLOCKING_QUESTIONS_ENABLED) {
      return { behavior: "allow", updatedInput: input };
    }
    const toolUseId =
      typeof options.toolUseID === "string" && options.toolUseID
        ? options.toolUseID
        : "";
    S.awaitingQuestionAnswer = true;
    log("canUseTool: AskUserQuestion — posting question, awaiting user answer");
    try {
      await postQuestion(toolUseId, JSON.stringify(input));
      const answerJson = await pollForAnswer(toolUseId, options.signal);
      if (answerJson === null) {
        return { behavior: "deny", message: "The question was cancelled." };
      }
      return {
        behavior: "allow",
        updatedInput: { ...input, answers: parseAnswers(answerJson) },
      };
    } finally {
      S.awaitingQuestionAnswer = false;
    }
  };
}
