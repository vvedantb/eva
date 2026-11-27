import { QueryClient } from "@tanstack/react-query";

/**
 * The app's TanStack Query client.
 *
 * This exists for Convex **actions** — one-shot RPCs that reach out to GitHub —
 * which have no cache and no reactivity of their own, so their results used to
 * live in component state and die on unmount. Reactive Convex queries are not
 * cached here: `useQuery` from `convex/react` already holds a live subscription,
 * and wrapping it would only add a staler copy.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});
