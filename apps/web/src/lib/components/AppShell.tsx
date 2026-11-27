import { lazy, Suspense, type ReactNode } from "react";
import { useMatches } from "@tanstack/react-router";
import { IS_EMBEDDED } from "@/lib/embed/embedded";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    appShell?: boolean;
  }
}

/**
 * Chrome is a lazy chunk so the entry (which the anonymous landing also
 * loads) stays free of the sidebar, spotlight search, hotkeys and their
 * dependencies. `main.tsx` prefetches it at boot for returning signed-in
 * users, so in practice the Suspense fallback only shows on a cold cache.
 */
const AppShellChrome = lazy(() =>
  import("@/lib/components/AppShellChrome").then((m) => ({
    default: m.AppShellChrome,
  })),
);

/**
 * Hoists the app chrome (sidebar, search, follow overlay, toasts) above the
 * router Outlet so it mounts once and persists across route transitions,
 * instead of remounting per top-level layout (_global vs _repo). Routes opt
 * in via `staticData: { appShell: true }` on their layout route.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const hasShell = useMatches({
    select: (matches) => matches.some((m) => m.staticData.appShell === true),
  });

  if (!hasShell) {
    return <>{children}</>;
  }

  return (
    <Suspense fallback={<div className="min-h-dvh bg-app-shell" />}>
      {/* `embedded` is passed from the entry so the lazy chrome chunk does not
          import `embedded.ts` (which also lives in the entry via `__root`) and
          create an async-chunk → entry cycle. */}
      <AppShellChrome embedded={IS_EMBEDDED}>{children}</AppShellChrome>
    </Suspense>
  );
}
