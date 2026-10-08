/**
 * Convex query resource-limit detection for MCP test queries.
 *
 * `run_test_function` failures like "Too many bytes read in a single function
 * execution (limit: 16777216 bytes)" used to throw out of `runTestQuery` as
 * an uncaught Server Error. Callers map the formatted message to an MCP
 * `isError` result instead.
 */

const CONVEX_RESOURCE_LIMIT_HINT =
  "Use smaller limits, paginate, or query with a selective index range.";

const CONVEX_RESOURCE_LIMIT_MARKERS = [
  "too many bytes read",
  "too many documents read",
  "too many bytes written",
  "too many writes in a single function",
  "function execution timed out",
  "maximum execution duration",
  "consider using smaller limits in your queries",
];

export function isConvexResourceLimitError(message: string): boolean {
  const lowered = message.toLowerCase();
  return CONVEX_RESOURCE_LIMIT_MARKERS.some((marker) =>
    lowered.includes(marker),
  );
}

/** User-facing MCP error text for a failed test query. */
export function formatConvexQueryError(message: string): string {
  if (!isConvexResourceLimitError(message)) return message;
  return `This query exceeded a Convex resource limit (bytes read, documents read, or execution time). ${CONVEX_RESOURCE_LIMIT_HINT} Details: ${message}`;
}
