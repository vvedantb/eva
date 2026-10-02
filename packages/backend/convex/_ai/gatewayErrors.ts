"use node";

import {
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

/**
 * The one mapping from AI SDK / AI Gateway failures to something a caller can
 * act on. Shared by Jev (`_jev/client.ts`) and Manager Ave (`mcp/aveRun.ts`),
 * which each turn `kind` into their own caller-facing codes and copy.
 *
 * Leaf module: SDK imports only, so either caller can use it without closing a
 * "use node" import cycle. Messages never include the request body or key.
 */

export type GatewayErrorKind =
  | "invalid_request"
  | "auth"
  | "model_not_found"
  | "rate_limit"
  | "gateway"
  | "malformed_response"
  | "timeout"
  | "other";

export type GatewayFailure = {
  kind: GatewayErrorKind;
  message: string;
  retryable: boolean;
  statusCode?: number;
};

export function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export function classifyGatewayError(error: unknown): GatewayFailure {
  if (RetryError.isInstance(error)) {
    return classifyGatewayError(error.lastError);
  }
  const message = errorMessageOf(error);
  if (
    InvalidArgumentError.isInstance(error) ||
    GatewayInvalidRequestError.isInstance(error)
  ) {
    return { kind: "invalid_request", message, retryable: false };
  }
  if (GatewayAuthenticationError.isInstance(error)) {
    return { kind: "auth", message, retryable: false };
  }
  if (
    NoSuchModelError.isInstance(error) ||
    GatewayModelNotFoundError.isInstance(error)
  ) {
    return { kind: "model_not_found", message, retryable: false };
  }
  if (GatewayRateLimitError.isInstance(error)) {
    return { kind: "rate_limit", message, retryable: true };
  }
  if (GatewayError.isInstance(error)) {
    return {
      kind: "gateway",
      message,
      retryable: error.isRetryable,
      statusCode: error.statusCode,
    };
  }
  if (InvalidResponseDataError.isInstance(error)) {
    return { kind: "malformed_response", message, retryable: true };
  }
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return { kind: "timeout", message, retryable: true };
  }
  return { kind: "other", message, retryable: false };
}
