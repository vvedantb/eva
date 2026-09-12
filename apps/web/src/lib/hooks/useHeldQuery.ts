"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReference } from "convex/server";
import { useRef } from "react";

/**
 * Like `useQuery`, but when `args` is `"skip"` the last successful result is
 * kept instead of flipping to `undefined`.
 *
 * Cached session shells skip their hot subscriptions (messages, streaming)
 * so a hidden executing turn does not re-render a whole chat tree. The held
 * snapshot is what was last painted, so switching back does not flash a
 * loading spinner.
 */
export function useHeldQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: Parameters<typeof useQuery<Query>>[1],
): ReturnType<typeof useQuery<Query>> {
  const result = useQuery(query, args);
  const held = useRef(result);
  if (result !== undefined) {
    held.current = result;
  }
  return (result !== undefined ? result : held.current) as ReturnType<
    typeof useQuery<Query>
  >;
}
