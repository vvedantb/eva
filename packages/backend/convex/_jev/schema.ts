/**
 * The TypeSafe Jev request contract: what a caller may ask, its caps, and the
 * shape of the answer set that comes back.
 *
 * Runtime-free (zod only) so both the V8 isolate (the `evaluate` MCP tool) and
 * the `"use node"` client share one definition without either reaching across
 * a runtime boundary.
 */

import { z } from "zod";
import { jsonValue, type JsonValue } from "./jsonValue";

/** Gateway id; the gateway typings also accept `typesafe-ai/jev-latest`. */
export const EVALUATE_MODEL = "typesafe-ai/jev";
/** Serialised `state` cap — Jev is a per-item judge, not a document reader. */
export const MAX_STATE_CHARS = 200_000;
export const MAX_QUESTIONS = 32;
/** Jev's own limit on choice options and score levels. */
export const MAX_OPTIONS = 255;
export const MAX_INSTRUCTION_CHARS = 20_000;

/** What Jev accepts for state, instructions and criteria: text or JSON. */
export const evalInput = z.union([
  z.string().min(1),
  z.record(z.string(), jsonValue),
  z.array(jsonValue),
]);

const criterion = evalInput.nullable();

export const booleanQuestion = z.object({
  type: z.literal("boolean"),
  instructions: evalInput.describe(
    "The yes/no question to answer about the state.",
  ),
  criteria: z
    .object({
      true: criterion.optional().describe("What makes the answer true."),
      false: criterion.optional().describe("What makes the answer false."),
    })
    .strict()
    .optional()
    .describe("Optional descriptions of the true and false cases."),
});

export const choiceQuestion = z.object({
  type: z.literal("choice"),
  instructions: evalInput.describe("What to decide about the state."),
  criteria: z
    .record(z.string().min(1).max(128), criterion)
    .refine(
      (options) => {
        const count = Object.keys(options).length;
        return count >= 1 && count <= MAX_OPTIONS;
      },
      { message: `choice criteria need 1 to ${MAX_OPTIONS} options` },
    )
    .describe(
      `Option name -> description (or null). 1 to ${MAX_OPTIONS} options; the answer is one of these names.`,
    ),
});

export const scoreQuestion = z.object({
  type: z.literal("score"),
  instructions: evalInput.describe("What to rate about the state."),
  criteria: z
    .array(criterion)
    .min(2)
    .max(MAX_OPTIONS)
    .describe(
      `Ordered level descriptions, lowest first. 2 to ${MAX_OPTIONS} levels; the answer is a position on this scale.`,
    ),
});

export const question = z.discriminatedUnion("type", [
  booleanQuestion,
  choiceQuestion,
  scoreQuestion,
]);

export const QUESTION_ID = /^[A-Za-z0-9_-]+$/;

/** Raw shape for `defineTool`; `search_tools` turns it into JSON schema for agents. */
export const evaluateInputShape = {
  state: evalInput.describe(
    `The thing to judge: a string, or a JSON object or array. Text only; up to ${MAX_STATE_CHARS.toLocaleString("en-GB")} characters serialised.`,
  ),
  questions: z
    .record(z.string().min(1).max(64).regex(QUESTION_ID), question)
    .refine(
      (questions) => {
        const count = Object.keys(questions).length;
        return count >= 1 && count <= MAX_QUESTIONS;
      },
      { message: `questions need 1 to ${MAX_QUESTIONS} entries` },
    )
    .describe(
      `Question id -> question. Ids are [A-Za-z0-9_-]. Each question is { type: "boolean" | "choice" | "score", instructions, criteria } — see the tool description. 1 to ${MAX_QUESTIONS} questions, all answered in one call.`,
    ),
} satisfies z.ZodRawShape;

/**
 * Full input schema. The size caps sit here rather than on the raw shape
 * because they span fields; the tool handler and the node client both parse
 * with this so a direct call is held to the same limits.
 */
export const evaluateInput = z
  .object(evaluateInputShape)
  .superRefine((value, ctx) => {
    const stateChars =
      typeof value.state === "string"
        ? value.state.length
        : JSON.stringify(value.state).length;
    if (stateChars > MAX_STATE_CHARS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state"],
        message: `state is ${stateChars.toLocaleString("en-GB")} characters serialised; the cap is ${MAX_STATE_CHARS.toLocaleString("en-GB")}`,
      });
    }
    for (const [id, entry] of Object.entries(value.questions)) {
      const chars =
        typeof entry.instructions === "string"
          ? entry.instructions.length
          : JSON.stringify(entry.instructions).length;
      if (chars > MAX_INSTRUCTION_CHARS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", id, "instructions"],
          message: `instructions exceed ${MAX_INSTRUCTION_CHARS.toLocaleString("en-GB")} characters`,
        });
      }
    }
  });

export type EvaluateInput = z.output<typeof evaluateInput>;

/** What in-repo callers hand to `evaluateDecision` as plain object literals. */
export type EvaluateInputRaw = z.input<typeof evaluateInput>;

/** One answer, normalised from the SDK result to exactly what agents are promised. */
export type EvaluateAnswer =
  | { type: "boolean"; probability: number }
  | { type: "choice"; choice: string; probabilities?: Record<string, number> }
  | { type: "score"; score: number; probabilities?: Record<string, number> };

export type EvaluateErrorCode =
  | "missing_config"
  | "invalid_request"
  | "provider_error";

/** The client's return, mirrored by the node action's Convex `returns` validator. */
export type EvaluateOutcome =
  | {
      ok: true;
      model: string;
      answers: Record<string, EvaluateAnswer>;
      usage: {
        inputTokens: number | null;
        outputTokens: number | null;
        totalTokens: number | null;
      };
      warnings: string[];
      metadata: JsonValue | null;
    }
  | {
      ok: false;
      errorCode: EvaluateErrorCode;
      error: string;
      retryable: boolean;
    };
