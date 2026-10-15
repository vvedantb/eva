import { Suspense, ViewTransition, type ReactNode } from "react";

/**
 * `<Suspense>` whose fallback fades out as the content rises in, via React
 * `<ViewTransition>` (classes in `globals.css`). Suspense reveals commit on
 * retry lanes, which React animates even outside `startTransition`.
 *
 * Route changes cannot use `<ViewTransition>`: TanStack Router renders them
 * through `useSyncExternalStore`, which always commits synchronously. Pages
 * animate through the router's `defaultViewTransition` in `main.tsx` instead.
 */
export function ViewTransitionSuspense({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <ViewTransition default="none" exit="vt-exit">
          {fallback}
        </ViewTransition>
      }
    >
      <ViewTransition default="none" enter="vt-enter">
        {children}
      </ViewTransition>
    </Suspense>
  );
}
