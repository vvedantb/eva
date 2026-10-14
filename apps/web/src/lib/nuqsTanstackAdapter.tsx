"use client";

import { startTransition } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import {
  renderQueryString,
  unstable_createAdapterProvider as createAdapterProvider,
  type unstable_AdapterInterface as AdapterInterface,
  type unstable_UpdateUrlFunction as UpdateUrlFunction,
} from "nuqs/adapters/custom";

/**
 * The watched keys of a router search object, as a query string.
 *
 * A string, not an object, because the router store compares selections with
 * `===`: the stock adapter selected a fresh object, so every `useQueryState`
 * in the app re-rendered on every navigation, even one that left its key alone.
 */
function watchedQuery(search: object, keys: ReadonlyArray<string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (!keys.includes(key) || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else if (typeof value === "object" && value !== null) {
      params.append(key, JSON.stringify(value));
    } else {
      params.append(key, String(value));
    }
  }
  return params.toString();
}

/**
 * Same behaviour as `nuqs/adapters/tanstack-router`, with two render fixes:
 *
 * 1. Consumers subscribe to their own keys only (see `watchedQuery`).
 * 2. `updateUrl` reads the pathname when it runs instead of closing over it.
 *    The stock one depended on the pathname, so every setter changed identity
 *    on each navigation and re-rendered whatever it was passed to — on a
 *    session switch that was every kept-alive session tree, three times.
 */
function useNuqsTanstackRouterAdapter(watchKeys: string[]): AdapterInterface {
  const router = useRouter();
  const query = useLocation({
    select: (location) => watchedQuery(location.search, watchKeys),
  });
  const searchParams = new URLSearchParams(query);
  const updateUrl: UpdateUrlFunction = (search, options) => {
    startTransition(() => {
      void router.navigate({
        from: "/",
        to: router.state.location.pathname + renderQueryString(search),
        replace: options.history === "replace",
        resetScroll: options.scroll,
        hash: (prevHash) => prevHash ?? "",
        state: (state) => state,
      });
    });
  };
  return { searchParams, updateUrl, rateLimitFactor: 1 };
}

export const NuqsAdapter = createAdapterProvider(useNuqsTanstackRouterAdapter);
