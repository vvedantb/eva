import {
  BLOCKING_QUESTIONS_ENABLED,
  CLAIM_MUTATION,
  ENTITY_ID,
} from "../config.js";
import {
  callConvexWithRetry,
  unwrapConvexMutationPayload,
} from "../http/convexClient.js";
import { callbackState as S } from "./state.js";
import type { JsonValue } from "../types.js";
import type { JsonLike, SdkCanUseTool } from "../providers/claudeSdk.js";
import { log } from "../utils.js";
import { sleep } from "./daemonProcess.js";

// How often the paused turn polls Convex for the user's answer. Matches the
// daemon's turn-claim cadence — the model is idle while waiting, so this only
// adds at most one poll of latency once the answer lands.
const POLL_INTERVAL_MS = 300;

/**
 * How long a paused turn holds the sandbox for an answer. Past this the turn
 * ends with the question on its message: the card stays up, and the answer
 * arrives later as the user's next message, which resumes the sandbox and
 * the session. Waiting longer only keeps an idle VM alive.
 */
export const QUESTION_WAIT_MS = 10 * 60 * 1000;

/** Tells the model why the tool was denied and that it must end the turn. */
export const QUESTION_RELEASED_MESSAGE =
  "The user has not answered yet. Eva keeps this question on screen after your turn and sends their answer as their next message. End your turn now with one short line: do not ask again and do no further work.";

/**
 * Reads `.value.answer` (a JSON string, or null) out of a claimAnswer result.
 * Convex's `/api/mutation` wraps returns in `{ status, value }`, so the answer
 * lives under `.value`; falls back to the top level for an unwrapped value.
 */
function readClaimedAnswer(result: JsonValue): string | null {
  const payload = unwrapConvexMutationPayload(result);
  if (!payload) return null;
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

type PollOutcome =
  | { kind: "answered"; answer: string }
  | { kind: "cancelled" }
  | { kind: "released" };

/**
 * Polls until the user answers, the turn is cancelled (signal aborts), or
 * `waitMs` passes. On timeout `pendingQuestions:release` takes an answer that
 * just landed, else drops the row, in one mutation, so no answer is lost.
 */
export async function pollForAnswer(
  toolUseId: string,
  signal: AbortSignal,
  waitMs: number = QUESTION_WAIT_MS,
): Promise<PollOutcome> {
  const args = { entityId: ENTITY_ID ?? "", toolUseId };
  const deadline = Date.now() + waitMs;
  while (!signal.aborted) {
    const timedOut = Date.now() >= deadline;
    const result = await callConvexWithRetry(
      "mutation",
      timedOut ? "pendingQuestions:release" : "pendingQuestions:claimAnswer",
      args,
    );
    const answer = readClaimedAnswer(result);
    if (answer !== null) return { kind: "answered", answer };
    if (timedOut) return { kind: "released" };
    await sleep(POLL_INTERVAL_MS);
  }
  return { kind: "cancelled" };
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
 * Convex and blocks up to `QUESTION_WAIT_MS` until the user answers — then
 * returns the answer as the tool's input so the model continues the SAME turn
 * with a real tool_result. Past the wait it denies the tool and the turn ends
 * with the question saved on its message (see `QUESTION_WAIT_MS`).
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
    // Only the three chat surfaces wire the answering UI, and never a run —
    // see `BLOCKING_QUESTIONS_ENABLED`. Everywhere else AskUserQuestion stays
    // fire-and-forget metadata (providers/claude.ts surfaces it after the
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
      const payload = JSON.stringify(input);
      await postQuestion(toolUseId, payload);
      const outcome = await pollForAnswer(toolUseId, options.signal);
      if (outcome.kind === "cancelled") {
        return { behavior: "deny", message: "The question was cancelled." };
      }
      if (outcome.kind === "released") {
        // The fire-and-forget field: completion saves it on the turn's
        // message, where the chat renders the same question card.
        S.pendingQuestionData = payload;
        return { behavior: "deny", message: QUESTION_RELEASED_MESSAGE };
      }
      const answers = parseAnswers(outcome.answer);
      if (toolUseId) {
        // The tool_result handler in providers/claude.ts moves this onto the
        // step, so the activity row carries the exact answers the user picked
        // rather than the SDK's prose retelling of them.
        const stringAnswers: Record<string, string> = {};
        for (const [question, answer] of Object.entries(answers)) {
          if (typeof answer === "string") {
            stringAnswers[question] = answer;
          }
        }
        S.questionAnswers.set(toolUseId, stringAnswers);
      }
      return { behavior: "allow", updatedInput: { ...input, answers } };
    } finally {
      S.awaitingQuestionAnswer = false;
    }
  };
}
