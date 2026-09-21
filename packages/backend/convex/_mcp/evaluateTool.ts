/**
 * The `evaluate` MCP tool: typed questions about one piece of state, answered
 * by TypeSafe's Jev decision model with probabilities instead of prose.
 *
 * Everything an agent sees — the input schema, its caps, the description and
 * the result shape — lives here, runtime-free, so it can be unit-tested and so
 * the V8 tool layer (`mcp/tools.ts`) and the `"use node"` action
 * (`mcp/evaluate.ts`) share one contract. The provider call itself is injected
 * as `run`, which keeps the SDK types confined to the node module.
 */

import { z } from "zod";
import { defineTool, type EvaTool } from "../mcp/registry";
import { errorResult, textResult } from "../mcp/toolShared";
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
const evalInput = z.union([
  z.string().min(1),
  z.record(z.string(), jsonValue),
  z.array(jsonValue),
]);

const criterion = evalInput.nullable();

const booleanQuestion = z.object({
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

const choiceQuestion = z.object({
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

const scoreQuestion = z.object({
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

const question = z.discriminatedUnion("type", [
  booleanQuestion,
  choiceQuestion,
  scoreQuestion,
]);

const QUESTION_ID = /^[A-Za-z0-9_-]+$/;

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
 * because they span fields; the tool handler and the node action both parse
 * with this so a direct action call is held to the same limits.
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

/** One answer, normalised from the SDK result to exactly what agents are promised. */
export type EvaluateAnswer =
  | { type: "boolean"; probability: number }
  | { type: "choice"; choice: string; probabilities?: Record<string, number> }
  | { type: "score"; score: number; probabilities?: Record<string, number> };

export type EvaluateErrorCode =
  | "missing_config"
  | "invalid_request"
  | "provider_error";

/** The node action's return, mirrored by its Convex `returns` validator. */
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

/** Agent-facing message for a failed outcome; never echoes the request. */
export function evaluateErrorMessage(
  outcome: Extract<EvaluateOutcome, { ok: false }>,
): string {
  switch (outcome.errorCode) {
    case "missing_config":
      return `evaluate is not configured: ${outcome.error} Set AI_GATEWAY_API_KEY on the Eva Convex deployment.`;
    case "invalid_request":
      return `evaluate rejected the request: ${outcome.error}`;
    case "provider_error":
      return `evaluate failed (${outcome.retryable ? "retryable" : "not retryable"}): ${outcome.error}`;
  }
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

export const EVALUATE_DESCRIPTION = `Ask TypeSafe Jev, a fast decision model, typed questions about one piece of state and get answers with probabilities. Use it when you have many similar items to classify, rank or filter (issues, PR titles, log lines, tasks, test names, review comments) and want a calibrated number to threshold on, or when the same rubric must be applied identically across items. Do not use it for a one-off judgement you can make yourself, and never to generate text: it only answers the questions you define.

Three question types, keyed by an id you choose:
- boolean: { "type": "boolean", "instructions": "...", "criteria"?: { "true"?: "...", "false"?: "..." } } -> { "type": "boolean", "probability": P(true) in [0, 1] }.
- choice: { "type": "choice", "instructions": "...", "criteria": { "optionName": "description or null", ... } } (1 to ${MAX_OPTIONS} options) -> { "type": "choice", "choice": "optionName", "probabilities"?: { optionName: p } }.
- score: { "type": "score", "instructions": "...", "criteria": ["lowest level", "next level", ...] } (2 to ${MAX_OPTIONS} ordered levels) -> { "type": "score", "score": position on the scale, "probabilities"?: { level: p } }.
instructions and criteria descriptions are strings or JSON. Write the rubric per call; there are no presets. Narrow, concrete questions beat one broad one.

Example: { "state": "fix: null deref in checkout when cart is empty", "questions": { "isBug": { "type": "boolean", "instructions": "Does this commit message describe a bug fix?" }, "area": { "type": "choice", "instructions": "Which area does it touch?", "criteria": { "frontend": null, "backend": null, "infra": null } }, "severity": { "type": "score", "instructions": "How severe is the underlying issue?", "criteria": ["cosmetic", "minor", "major", "critical"] } } }

Limits: state up to ${MAX_STATE_CHARS.toLocaleString("en-GB")} characters serialised, up to ${MAX_QUESTIONS} questions per call, one state per call. To judge many items, loop inside \`execute\` with a constant questions object: for (const item of items) await tools.evaluate({ state: item, questions }). Returns { model, answers, usage, warnings?, metadata? }; when present, metadata.typesafe.confidence carries Jev's confidence for choice and score answers.

Data: text and JSON only, sent to Vercel AI Gateway with zero data retention requested. Do not pass secrets or personal data you would not put in a prompt.`;

/**
 * Builds the tool over an injected provider call. `tools.ts` passes the Convex
 * action; tests pass a fake. The handler re-parses with the full schema so the
 * cross-field caps apply before anything leaves the process.
 */
export function evaluateTool(
  run: (input: EvaluateInput) => Promise<EvaluateOutcome>,
): EvaTool {
  return defineTool({
    name: "evaluate",
    description: EVALUATE_DESCRIPTION,
    mutating: false,
    input: evaluateInputShape,
    handler: async (args) => {
      const parsed = evaluateInput.safeParse(args);
      if (!parsed.success) {
        return errorResult(
          `Invalid evaluate input: ${describeIssues(parsed.error)}`,
        );
      }
      const outcome = await run(parsed.data);
      if (!outcome.ok) return errorResult(evaluateErrorMessage(outcome));
      return textResult({
        model: outcome.model,
        answers: outcome.answers,
        usage: outcome.usage,
        ...(outcome.warnings.length > 0 ? { warnings: outcome.warnings } : {}),
        ...(outcome.metadata !== null ? { metadata: outcome.metadata } : {}),
      });
    },
  });
}
