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

function readClaimedAnswer(result: JsonValue): string | null {
  const payload = unwrapConvexMutationPayload(result);
  if (!payload) return null;
  const answer = payload.answer;
  return typeof answer === "string" ? answer : null;
}

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

async function pollForAnswer(
  toolUseId: string,
  signal: AbortSignal,
): Promise<PollOutcome> {
  const args = { entityId: ENTITY_ID ?? "", toolUseId };
  const deadline = Date.now() + QUESTION_WAIT_MS;
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
        S.pendingQuestionData = payload;
        return { behavior: "deny", message: QUESTION_RELEASED_MESSAGE };
      }
      const answers = parseAnswers(outcome.answer);
      if (toolUseId) {
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
