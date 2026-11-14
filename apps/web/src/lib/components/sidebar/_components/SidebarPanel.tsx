"use client";

import type { RefCallback } from "react";
import { cn } from "@eva/ui";
import { Sidebar } from "@vvedantb/ui";
import { OnlineTeamAvatars } from "@/lib/components/sidebar/TeamMembers";
import { ContextSidebarHeaderActionProvider } from "@/lib/components/sidebar/ContextSidebarHeaderAction";
import { SidebarPanelBody } from "@/lib/components/sidebar/_components/SidebarPanelBody";
import { SidebarPanelHeader } from "@/lib/components/sidebar/_components/SidebarPanelHeader";
import { type ContextSidebarMode } from "@/lib/components/sidebar/contextSidebarModes";
import {
  type SidebarPanelFlags,
  type SidebarRepoRoute,
  type RepoDoc,
} from "@/lib/components/sidebar/sidebarPanelState";

interface SidebarPanelProps {
  panelKey: string;
  flags: SidebarPanelFlags;
  contextSidebarMode: ContextSidebarMode;
  setContextSidebarMode: (mode: ContextSidebarMode) => void;
  pathname: string;
  route: SidebarRepoRoute;
  repo: RepoDoc | null | undefined;
  repoLogoUrl: string | null | undefined;
  teamBackgroundUrl: string | null;
  scrollRef: RefCallback<HTMLDivElement>;
  onNavigate: () => void;
}

/**
 * Secondary sidebar column next to the rail: header, nav list, footer. The
 * package `Sidebar.Panel` owns the layout and hides it when collapsed on desktop.
 */
export function SidebarPanel({
  panelKey,
  flags,
  contextSidebarMode,
  setContextSidebarMode,
  pathname,
  route,
  repo,
  repoLogoUrl,
  teamBackgroundUrl,
  scrollRef,
  onNavigate,
}: SidebarPanelProps) {
  const { repoBasePath, repoName, appName, isRepoRoute } = route;
  const { showGlobalSessionsPanel, showGlobalAutomationsPanel } = flags;
  return (
    <Sidebar.Panel className="border-r border-sidebar-border bg-sidebar">
      <ContextSidebarHeaderActionProvider key={panelKey}>
        {(headerAction) => (
          <>
            <SidebarPanelHeader
              panelKey={panelKey}
              flags={flags}
              contextSidebarMode={contextSidebarMode}
              headerAction={headerAction}
              teamBackgroundUrl={teamBackgroundUrl}
              repo={repo}
              repoName={repoName}
              appName={appName}
              repoLogoUrl={repoLogoUrl}
              onClose={onNavigate}
              onBackToMain={() => setContextSidebarMode("main")}
            />

            {/* `max-md:overscroll-y-contain`: below `md` this is a drawer over
                the page, and a scroll past its end moved the page behind. */}
            <nav
              ref={scrollRef}
              className={cn(
                "scrollbar scroll-fade flex min-h-0 flex-1 flex-col justify-between overflow-y-auto px-2 max-md:overscroll-y-contain",
                flags.isSourceListHeader ? "pb-2 pt-1.5" : "py-2",
              )}
            >
              <div
                className={
                  showGlobalSessionsPanel || showGlobalAutomationsPanel
                    ? "space-y-0"
                    : "space-y-4"
                }
              >
                <SidebarPanelBody
                  panelKey={panelKey}
                  flags={flags}
                  contextSidebarMode={contextSidebarMode}
                  pathname={pathname}
                  repo={repo}
                  repoBasePath={repoBasePath}
                  onNavigate={onNavigate}
                  setContextSidebarMode={setContextSidebarMode}
                />
              </div>
            </nav>

            {/* Footer shows online teammates only. */}
            {showGlobalSessionsPanel ||
            showGlobalAutomationsPanel ||
            (isRepoRoute && repoBasePath) ? (
              <div className="px-6 py-3">
                <OnlineTeamAvatars collapsed={false} />
              </div>
            ) : null}
          </>
        )}
      </ContextSidebarHeaderActionProvider>
    </Sidebar.Panel>
  );
}
