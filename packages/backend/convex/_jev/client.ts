"use node";

/**
 * The one place Eva calls TypeSafe Jev. Every caller — the `evaluate` MCP tool
 * action and in-repo features like task tagging — goes through
 * {@link evaluateDecision}, so the caps, the timeout, the zero-data-retention
 * flag and the error mapping are defined once.
 *
 * Imports stay confined to the SDK and the two leaf modules beside this file;
 * reaching into `mcp/*` or `functions.ts` would put a `"use node"` chunk in an
 * import cycle, which breaks the Convex prod push.
 */

import {
  experimental_evaluate as evaluate,
  Experimental_EvaluationUnsupportedQuestionTypeError,
  InvalidArgumentError,
  InvalidResponseDataError,
  NoSuchModelError,
  RetryError,
} from "ai";
import {
  GatewayAuthenticationError,
  GatewayError,
  GatewayInvalidRequestError,
  GatewayModelNotFoundError,
  GatewayRateLimitError,
} from "@ai-sdk/gateway";
import {
  EVALUATE_MODEL,
  evaluateInput,
  type EvaluateAnswer,
  type EvaluateInputRaw,
  type EvaluateOutcome,
} from "./schema";
import { jsonValue } from "./jsonValue";

/** Jev answers in well under a second; anything past this is the gateway stalling. */
const REQUEST_TIMEOUT_MS = 30_000;
/** One retry on transient gateway failures; callers see `retryable` for the rest. */
const MAX_RETRIES = 1;

type Failure = Extract<EvaluateOutcome, { ok: false }>;

function failure(
  errorCode: Failure["errorCode"],
  error: string,
  retryable = false,
): Failure {
  return { ok: false, errorCode, error, retryable };
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

/**
 * Maps SDK and gateway failures onto the three caller-facing error codes.
 * Never includes the request body or the API key; the SDK messages do not
 * carry them either, but the guard is the point.
 */
function classifyError(error: unknown): Failure {
  if (RetryError.isInstance(error)) return classifyError(error.lastError);
  if (
    Experimental_EvaluationUnsupportedQuestionTypeError.isInstance(error) ||
    InvalidArgumentError.isInstance(error) ||
    GatewayInvalidRequestError.isInstance(error)
  ) {
    return failure("invalid_request", messageOf(error));
  }
  if (GatewayAuthenticationError.isInstance(error)) {
    return failure(
      "missing_config",
      `AI Gateway rejected AI_GATEWAY_API_KEY: ${messageOf(error)}`,
    );
  }
  if (
    NoSuchModelError.isInstance(error) ||
    GatewayModelNotFoundError.isInstance(error)
  ) {
    return failure(
      "provider_error",
      `Model ${EVALUATE_MODEL} is not available on AI Gateway (check the model id and the team's model allow-list): ${messageOf(error)}`,
    );
  }
  if (GatewayRateLimitError.isInstance(error)) {
    return failure("provider_error", messageOf(error), true);
  }
  if (GatewayError.isInstance(error)) {
    return failure(
      "provider_error",
      `AI Gateway error ${error.statusCode}: ${messageOf(error)}`,
      error.isRetryable,
    );
  }
  if (InvalidResponseDataError.isInstance(error)) {
    return failure(
      "provider_error",
      `Jev returned a malformed answer set: ${messageOf(error)}`,
      true,
    );
  }
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return failure(
      "provider_error",
      `Jev did not answer within ${REQUEST_TIMEOUT_MS / 1000} seconds`,
      true,
    );
  }
  return failure("provider_error", messageOf(error));
}

/** Copies only the fields callers are promised, so SDK extras never leak through. */
function normaliseAnswers(
  answers: Record<string, EvaluateAnswer>,
): Record<string, EvaluateAnswer> {
  const out: Record<string, EvaluateAnswer> = {};
  for (const [id, answer] of Object.entries(answers)) {
    switch (answer.type) {
      case "boolean":
        out[id] = { type: "boolean", probability: answer.probability };
        break;
      case "choice":
        out[id] = {
          type: "choice",
          choice: answer.choice,
          ...(answer.probabilities
            ? { probabilities: answer.probabilities }
            : {}),
        };
        break;
      case "score":
        out[id] = {
          type: "score",
          score: answer.score,
          ...(answer.probabilities
            ? { probabilities: answer.probabilities }
            : {}),
        };
        break;
    }
  }
  return out;
}

function describeWarning(warning: {
  type: string;
  feature?: string;
  details?: string;
  message?: string;
}): string {
  if (warning.message) return warning.message;
  const feature = warning.feature ?? warning.type;
  return warning.details ? `${feature}: ${warning.details}` : feature;
}

/**
 * Asks Jev the caller's typed questions about one piece of state. Errors come
 * back as data rather than throwing, so a background caller can log and move
 * on. `tag` is the gateway usage tag that attributes the spend to a feature.
 */
export async function evaluateDecision(
  input: EvaluateInputRaw,
  options: { tag: string },
): Promise<EvaluateOutcome> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return failure(
      "missing_config",
      "AI_GATEWAY_API_KEY is not set on this Convex deployment.",
    );
  }

  const parsed = evaluateInput.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return failure("invalid_request", issues);
  }

  try {
    const result = await evaluate({
      model: EVALUATE_MODEL,
      state: parsed.data.state,
      questions: parsed.data.questions,
      maxRetries: MAX_RETRIES,
      abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      providerOptions: {
        gateway: { zeroDataRetention: true, tags: [options.tag] },
      },
    });
    // Provider metadata is JSON on the wire; parse rather than trust the type.
    const metadata = jsonValue.safeParse(result.providerMetadata ?? null);
    return {
      ok: true,
      model: result.response.modelId,
      answers: normaliseAnswers(result.answers),
      usage: {
        inputTokens: result.usage.inputTokens ?? null,
        outputTokens: result.usage.outputTokens ?? null,
        totalTokens: result.usage.totalTokens ?? null,
      },
      warnings: result.warnings.map(describeWarning),
      metadata: metadata.success ? metadata.data : null,
    };
  } catch (error) {
    const outcome = classifyError(error);
    if (outcome.errorCode !== "invalid_request") {
      console.error("[jev]", options.tag, outcome.errorCode, outcome.error);
    }
    return outcome;
  }
}
