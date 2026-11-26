import type { ReactNode } from "react";
import { AuthGate } from "@/lib/components/ClientProvider";
import { AveLauncherProvider } from "@/lib/components/ave/AveLauncherProvider";
import { FollowOverlay } from "@/lib/components/FollowOverlay";
import { Sidebar } from "@/lib/components/Sidebar";
import { SpotlightSearch } from "@/lib/components/SpotlightSearch";
import { NotificationToastStream } from "@/lib/components/NotificationToastStream";
import { UpdateAvailableToast } from "@/lib/components/UpdateAvailableToast";
import { ConnectionStatusToast } from "@/lib/components/ConnectionStatusToast";
import { FollowProvider } from "@/lib/contexts/FollowContext";
import { SidebarProvider } from "@/lib/contexts/SidebarContext";
import { PageTitleProvider } from "@/lib/contexts/PageTitleContext";
import { SearchProvider } from "@/lib/contexts/SearchContext";
import { ShortcutsProvider } from "@/lib/hotkeys/ShortcutsContext";
import { ShortcutsCheatsheet } from "@/lib/hotkeys/ShortcutsCheatsheet";

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
            <ShortcutsProvider>
              <SearchProvider>
                <FollowProvider>
                  <AveLauncherProvider enabled={!embedded}>
                    {embedded ? children : <Sidebar>{children}</Sidebar>}
                  </AveLauncherProvider>
                  {embedded ? null : (
                    <>
                      <SpotlightSearch />
                      <ShortcutsCheatsheet />
                      <FollowOverlay />
                      <NotificationToastStream />
                      <UpdateAvailableToast />
                      <ConnectionStatusToast />
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
