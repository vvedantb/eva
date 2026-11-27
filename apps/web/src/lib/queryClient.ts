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
      // A GitHub round trip costs hundreds of milliseconds, so anything fetched
      // in the last 30 seconds is good enough to paint immediately while a
      // background refetch runs.
      staleTime: 30_000,
      // Every consumer renders its own error state with a retry control, and a
      // silent triple retry only delays it.
      retry: false,
      // Diff payloads are large and re-highlighting flashes the whole file list,
      // so returning to the tab does not refetch.
      refetchOnWindowFocus: false,
    },
  },
});
