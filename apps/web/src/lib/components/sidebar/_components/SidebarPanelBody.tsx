import { lazy, Suspense } from "react";
import type { FunctionReturnType } from "convex/server";
import { m } from "motion/react";
import { api } from "@eva/backend";
import { motionBase, Spinner } from "@eva/ui";
import { RepoNavSections } from "@/lib/components/sidebar/RepoNavSections";
import { RepoTopNav } from "@/lib/components/sidebar/RepoTopNav";
import { type ContextSidebarMode } from "@/lib/components/sidebar/contextSidebarModes";
import { type SidebarPanelFlags } from "@/lib/components/sidebar/sidebarPanelState";

type RepoDoc = FunctionReturnType<typeof api.githubRepos.getByOwnerAndName>;

/** Panel bodies load on demand so unused modes stay off the shell chunk. */
const SettingsSidebar = lazy(() =>
  import("@/lib/components/sidebar/SettingsSidebar").then((mod) => ({
    default: mod.SettingsSidebar,
  })),
);
const DocsSidebar = lazy(() =>
  import("@/lib/components/sidebar/DocsSidebar").then((mod) => ({
    default: mod.DocsSidebar,
  })),
);
const ReviewsSidebar = lazy(() =>
  import("@/lib/components/sidebar/ReviewsSidebar").then((mod) => ({
    default: mod.ReviewsSidebar,
  })),
);
const GlobalSessionsSidebar = lazy(() =>
  import("@/lib/components/sidebar/GlobalSessionsSidebar").then((mod) => ({
    default: mod.GlobalSessionsSidebar,
  })),
);
const HomeSidebar = lazy(() =>
  import("@/lib/components/sidebar/HomeSidebar").then((mod) => ({
    default: mod.HomeSidebar,
  })),
);
const TestingArenaSidebar = lazy(() =>
  import("@/lib/components/sidebar/TestingArenaSidebar").then((mod) => ({
    default: mod.TestingArenaSidebar,
  })),
);
const GlobalAutomationsSidebar = lazy(() =>
  import("@/lib/components/sidebar/GlobalAutomationsSidebar").then((mod) => ({
    default: mod.GlobalAutomationsSidebar,
  })),
);
const GlobalSettingsSidebar = lazy(() =>
  import("@/lib/components/sidebar/GlobalSettingsSidebar").then((mod) => ({
    default: mod.GlobalSettingsSidebar,
  })),
);

const sidebarPanelFallback = (
  <div className="flex items-center justify-center py-8">
    <Spinner size="sm" />
  </div>
);

interface SidebarPanelBodyProps {
  panelKey: string;
  flags: SidebarPanelFlags;
  contextSidebarMode: ContextSidebarMode;
  pathname: string;
  repo: RepoDoc | null | undefined;
  repoBasePath: string | null;
  onNavigate: () => void;
  setContextSidebarMode: (mode: ContextSidebarMode) => void;
}

/** Animated, lazily loaded nav list for the active sidebar panel. */
export function SidebarPanelBody({
  panelKey,
  flags,
  contextSidebarMode,
  pathname,
  repo,
  repoBasePath,
  onNavigate,
  setContextSidebarMode,
}: SidebarPanelBodyProps) {
  return (
    <m.div
      key={`${panelKey}-nav`}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={motionBase}
    >
      <Suspense fallback={sidebarPanelFallback}>
        {flags.showGlobalSessionsPanel ? (
          <GlobalSessionsSidebar pathname={pathname} onNavigate={onNavigate} />
        ) : flags.showGlobalAutomationsPanel ? (
          <GlobalAutomationsSidebar
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ) : flags.showHomePanel ? (
          <HomeSidebar pathname={pathname} onNavigate={onNavigate} />
        ) : flags.showGlobalSettingsPanel ? (
          <GlobalSettingsSidebar pathname={pathname} onNavigate={onNavigate} />
        ) : flags.showContextSidebar ? (
          <ContextSidebarBody
            contextSidebarMode={contextSidebarMode}
            pathname={pathname}
            repo={repo}
            repoBasePath={repoBasePath}
            onNavigate={onNavigate}
          />
        ) : repoBasePath ? (
          <div className="space-y-4">
            <RepoTopNav
              repoBasePath={repoBasePath}
              pathname={pathname}
              collapsed={false}
              repo={repo}
              onNavigate={onNavigate}
            />
            <RepoNavSections
              repoBasePath={repoBasePath}
              pathname={pathname}
              collapsed={false}
              repo={repo}
              onOpenContextSidebar={(mode) => {
                setContextSidebarMode(mode);
              }}
              onNavigate={onNavigate}
            />
          </div>
        ) : null}
      </Suspense>
    </m.div>
  );
}

function ContextSidebarBody({
  contextSidebarMode,
  pathname,
  repo,
  repoBasePath,
  onNavigate,
}: {
  contextSidebarMode: ContextSidebarMode;
  pathname: string;
  repo: RepoDoc | null | undefined;
  repoBasePath: string | null;
  onNavigate: () => void;
}) {
  return contextSidebarMode === "settings" ? (
    <SettingsSidebar
      basePath={repoBasePath ?? ""}
      pathname={pathname}
      onNavigate={onNavigate}
    />
  ) : repo && repoBasePath ? (
    contextSidebarMode === "docs" ? (
      <DocsSidebar
        repoId={repo._id}
        basePath={repoBasePath}
        pathname={pathname}
        onNavigate={onNavigate}
      />
    ) : contextSidebarMode === "reviews" ? (
      <ReviewsSidebar
        repoId={repo._id}
        basePath={repoBasePath}
        pathname={pathname}
        onNavigate={onNavigate}
      />
    ) : (
      <TestingArenaSidebar
        repoId={repo._id}
        basePath={repoBasePath}
        pathname={pathname}
        onNavigate={onNavigate}
      />
    )
  ) : (
    sidebarPanelFallback
  );
}
