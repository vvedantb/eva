"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReference } from "convex/server";
import { convexToJson } from "convex/values";
import { useHeldResult } from "@vvedantb/ui";

/**
 * Like `useQuery`, but when `args` is `"skip"` the last successful result is
 * kept instead of flipping to `undefined`.
 *
 * Cached session shells skip their hot subscriptions (messages, streaming)
 * so a hidden executing turn does not re-render a whole chat tree. The held
 * snapshot is what was last painted, so switching back does not flash a
 * loading spinner.
 *
 * The hold is keyed on the args: new args (another chat) load as `undefined`
 * rather than showing the previous args' data. Pass `holdKey` to keep the
 * last result across arg changes on purpose (e.g. the active chat of one
 * session, so a tab switch does not unmount the whole page).
 */
export function useHeldQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: Parameters<typeof useQuery<Query>>[1],
  holdKey?: string,
): ReturnType<typeof useQuery<Query>> {
  const result: ReturnType<typeof useQuery<Query>> = useQuery(query, args);
  return useHeldResult(
    result,
    args === "skip"
      ? null
      : (holdKey ?? JSON.stringify(convexToJson(args ?? {}))),
  );
}
