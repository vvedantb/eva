"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReference } from "convex/server";
import { useState } from "react";

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
  const result: ReturnType<typeof useQuery<Query>> = useQuery(query, args);
  // Held in state, not a ref: reading a ref during render makes the React
  // Compiler skip the whole file. Adjusting state during render is the
  // supported way to remember the previous value.
  const [held, setHeld] = useState(result);
  if (result !== undefined && result !== held) {
    setHeld(result);
  }
  return result !== undefined ? result : held;
}
