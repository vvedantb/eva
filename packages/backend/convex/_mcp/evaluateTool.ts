/**
 * The `evaluate` MCP tool: typed questions about one piece of state, answered
 * by TypeSafe's Jev decision model with probabilities instead of prose.
 *
 * The request contract itself — the input schema, its caps and the result
 * shape — lives in `_jev/schema.ts`, shared with every non-MCP caller. What
 * stays here is the agent-facing surface: the description, the error copy and
 * the tool factory. The provider call is injected as `run`, which keeps the
 * SDK types confined to the node module.
 */

import type { z } from "zod";
import { defineTool, type EvaTool } from "../mcp/registry";
import { errorResult, textResult } from "../mcp/toolShared";
import {
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MAX_STATE_CHARS,
  evaluateInput,
  evaluateInputShape,
  type EvaluateInput,
  type EvaluateOutcome,
} from "../_jev/schema";

// Re-exported so the tool layer and its tests have one import for the whole
// `evaluate` contract; the definitions live in `_jev/schema.ts`.
export {
  EVALUATE_MODEL,
  MAX_STATE_CHARS,
  MAX_QUESTIONS,
  MAX_OPTIONS,
  MAX_INSTRUCTION_CHARS,
  evaluateInput,
  evaluateInputShape,
} from "../_jev/schema";
export type {
  EvaluateInput,
  EvaluateAnswer,
  EvaluateOutcome,
} from "../_jev/schema";

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
