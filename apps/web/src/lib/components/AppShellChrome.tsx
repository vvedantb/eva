import type { ReactNode } from "react";
import { AuthGate } from "@/lib/components/ClientProvider";
import { AveLauncherProvider } from "@/lib/components/ave/AveLauncherProvider";
import { FollowOverlay } from "@/lib/components/FollowOverlay";
import { Sidebar } from "@/lib/components/Sidebar";
import { SpotlightSearch } from "@/lib/components/SpotlightSearch";
import { NotificationToastStream } from "@/lib/components/NotificationToastStream";
import { UpdateAvailableToast } from "@/lib/components/UpdateAvailableToast";
import { FollowProvider } from "@/lib/contexts/FollowContext";
import { SidebarProvider } from "@/lib/contexts/SidebarContext";
import { PageTitleProvider } from "@/lib/contexts/PageTitleContext";
import { SearchProvider } from "@/lib/contexts/SearchContext";
import { ShortcutsProvider } from "@/lib/hotkeys/ShortcutsContext";

/**
 * The signed-in app chrome. Split from `AppShell` so the sidebar, spotlight
 * search (cmdk), hotkeys, avatars and their dependencies live in a lazy chunk
 * instead of the entry — anonymous landing visitors never download them.
 * `main.tsx` warms this chunk at boot when the signed-in hint is set, so app
 * users fetch it in parallel with Clerk's session handshake.
 *
 * `embedded` is a prop (not an `embedded.ts` import) so this lazy chunk does
 * not pull the entry-resident embed module and form an async→entry cycle.
 */
export function AppShellChrome({
  children,
  embedded,
}: {
  children: ReactNode;
  embedded: boolean;
}) {
  return (
    <AuthGate>
      <div className="relative min-h-dvh bg-app-shell">
        <SidebarProvider>
          <PageTitleProvider>
            {/* Above SearchProvider: its Mod+K registration is a consumer. */}
            <ShortcutsProvider>
              <SearchProvider>
                <FollowProvider>
                  {/* Wraps the outlet rather than sitting beside it: the
                      launcher popover keeps a live chat mounted, so it has to
                      live above the routed content that comes and goes.
                      The sidebar is inside it — first, so the DOM order of the
                      fixed z-50 chrome is unchanged — because below `lg` the
                      mobile header owns Ave's summon button and reads the
                      launcher state from its context. */}
                  <AveLauncherProvider enabled={!embedded}>
                    {/* Embedded documents (inbox preview pane) render content
                        only: the host window already owns the sidebar, search,
                        follow overlay and toast streams. Providers stay — pages
                        consume them regardless of where they render. */}
                    {embedded ? null : <Sidebar />}
                    {children}
                  </AveLauncherProvider>
                  {embedded ? null : (
                    <>
                      <SpotlightSearch />
                      <FollowOverlay />
                      <NotificationToastStream />
                      <UpdateAvailableToast />
                    </>
                  )}
                </FollowProvider>
              </SearchProvider>
            </ShortcutsProvider>
          </PageTitleProvider>
        </SidebarProvider>
      </div>
    </AuthGate>
  );
}
