import type { RefCallback } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@eva/backend";
import { cn } from "@eva/ui";
import { OnlineTeamAvatars } from "@/lib/components/sidebar/TeamMembers";
import { SidebarResizeHandle } from "@/lib/components/sidebar/SidebarResizeHandle";
import { ContextSidebarHeaderActionProvider } from "@/lib/components/sidebar/ContextSidebarHeaderAction";
import { SidebarPanelBody } from "@/lib/components/sidebar/_components/SidebarPanelBody";
import { SidebarPanelHeader } from "@/lib/components/sidebar/_components/SidebarPanelHeader";
import { type ContextSidebarMode } from "@/lib/components/sidebar/contextSidebarModes";
import {
  type SidebarPanelFlags,
  type SidebarRepoRoute,
} from "@/lib/components/sidebar/sidebarPanelState";

type RepoDoc = FunctionReturnType<typeof api.githubRepos.getByOwnerAndName>;

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
  collapsed: boolean;
  sidebarWidth: number;
  previewSidebarWidth: (width: number) => void;
  commitSidebarWidth: (width: number) => void;
  setSidebarWidth: (width: number) => void;
}

/** Secondary sidebar column next to the rail: header, nav list, footer, resize handle. */
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
  collapsed,
  sidebarWidth,
  previewSidebarWidth,
  commitSidebarWidth,
  setSidebarWidth,
}: SidebarPanelProps) {
  const { repoBasePath, repoName, appName, isRepoRoute } = route;
  const { showGlobalSessionsPanel, showGlobalAutomationsPanel } = flags;
  return (
    <div
      className={cn(
        "relative flex h-full min-w-0 flex-1 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar",
        // Keep the drawer content on mobile even when the desktop panel is hidden.
        collapsed && "lg:hidden",
      )}
    >
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

            <nav
              ref={scrollRef}
              className={cn(
                "scrollbar scroll-fade flex min-h-0 flex-1 flex-col justify-between overflow-y-auto px-2",
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
            {!collapsed ? (
              <SidebarResizeHandle
                width={sidebarWidth}
                onWidthPreview={previewSidebarWidth}
                onWidthCommit={commitSidebarWidth}
                onWidthChange={setSidebarWidth}
              />
            ) : null}
          </>
        )}
      </ContextSidebarHeaderActionProvider>
    </div>
  );
}
