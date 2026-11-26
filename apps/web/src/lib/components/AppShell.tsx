import { lazy, Suspense, type ReactNode } from "react";
import { useMatches } from "@tanstack/react-router";
import { IS_EMBEDDED } from "@/lib/embed/embedded";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    appShell?: boolean;
  }
}

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
      <AppShellChrome embedded={IS_EMBEDDED}>{children}</AppShellChrome>
    </Suspense>
  );
}
