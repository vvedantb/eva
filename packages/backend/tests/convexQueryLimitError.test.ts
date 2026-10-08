import { describe, expect, test } from "vitest";
import {
  formatConvexQueryError,
  isConvexResourceLimitError,
} from "../convex/mcp/convexQueryLimits";

/**
 * Prod (2026-09-01): an MCP `run_query` that read the whole table threw
 * "Uncaught Error: Too many bytes read in a single function execution" out of
 * `runTestQuery`, so the agent saw a Server Error instead of an actionable MCP
 * error. `runTestQuery` now returns `{ ok: false, error }` with this text
 * (fix 55a7b876b).
 */
describe("Convex resource-limit errors are recognised", () => {
  const limitMessages = [
    "Too many bytes read in a single function execution (limit: 16777216 bytes). Consider using smaller limits in your queries, paginating your queries, or using indexed queries with a selective index range expressions.",
    "Too many documents read in a single function execution (limit: 16384). Consider using smaller limits in your queries",
    "Too many bytes written in a single function execution",
    "Too many writes in a single function execution",
    "Function execution timed out",
    "Exceeded maximum execution duration",
  ];

  test("every Convex limit failure is classified", () => {
    for (const message of limitMessages) {
      expect(isConvexResourceLimitError(message), message).toBe(true);
    }
  });

  test("matching is case-insensitive, as Convex wording varies", () => {
    expect(isConvexResourceLimitError("TOO MANY BYTES READ")).toBe(true);
    expect(isConvexResourceLimitError("too many bytes read")).toBe(true);
  });

  test("ordinary query failures are not limit failures", () => {
    // These must reach the agent verbatim: rewriting them as "use smaller
    // limits" would send it chasing pagination instead of the real fault.
    for (const message of [
      "ReferenceError: ctx is not defined",
      'Index "by_repo" not found in table "sessions"',
      "Server Error: Uncaught TypeError: Cannot read properties of undefined",
      "fetch failed",
    ]) {
      expect(isConvexResourceLimitError(message), message).toBe(false);
    }
  });
});

describe("the formatted MCP error", () => {
  test("adds the remedy and keeps the original details", () => {
    const original =
      "Too many bytes read in a single function execution (limit: 16777216 bytes).";
    const formatted = formatConvexQueryError(original);
    expect(formatted).toContain("Convex resource limit");
    expect(formatted).toContain("paginate");
    // The raw message carries the actual limit and the failing table; dropping
    // it would leave the agent unable to tell which query blew up.
    expect(formatted).toContain(original);
  });

  test("passes a non-limit failure through untouched", () => {
    const original = "ReferenceError: ctx is not defined";
    expect(formatConvexQueryError(original)).toBe(original);
  });
});
