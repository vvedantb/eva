"use client";

import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { m } from "motion/react";
import { IconChevronLeft, IconX } from "@tabler/icons-react";
import { RepoLogo } from "@/lib/components/RepoLogo";
import type { api } from "@eva/backend";
import { Button, cn, motionBase } from "@eva/ui";
import { AutomationsSidebarOptionsMenu } from "@/lib/components/sidebar/_components/AutomationsSidebarOptionsMenu";
import { SessionsSidebarOptionsMenu } from "@/lib/components/sidebar/_components/SessionsSidebarOptionsMenu";
import { type ContextSidebarMode } from "@/lib/components/sidebar/contextSidebarModes";
import {
  getContextSidebarTitle,
  getFlatPanelTitle,
  type SidebarPanelFlags,
} from "@/lib/components/sidebar/sidebarPanelState";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";

type RepoDoc = FunctionReturnType<typeof api.githubRepos.getByOwnerAndName>;

interface SidebarPanelHeaderProps {
  panelKey: string;
  flags: SidebarPanelFlags;
  contextSidebarMode: ContextSidebarMode;
  headerAction: ReactNode;
  teamBackgroundUrl: string | null;
  repo: RepoDoc | null | undefined;
  repoName: string | null;
  appName: string | undefined;
  repoLogoUrl: string | null | undefined;
  onClose: () => void;
  onBackToMain: () => void;
}

/** Title row of the secondary panel: flat list title, drill-down back row, or repo identity. */
export function SidebarPanelHeader({
  panelKey,
  flags,
  contextSidebarMode,
  headerAction,
  teamBackgroundUrl,
  repo,
  repoName,
  appName,
  repoLogoUrl,
  onClose,
  onBackToMain,
}: SidebarPanelHeaderProps) {
  const { isSourceListHeader, isFlatPanel, showContextSidebar } = flags;
  return (
    <div
      className={cn(
        "relative flex items-center overflow-hidden",
        // Repo identity keeps a reserved tall slot so team art
        // resolving later does not shift the nav list (CLS).
        isSourceListHeader ? "px-2 pt-3" : "h-24 px-3",
      )}
    >
      {teamBackgroundUrl && !showContextSidebar && !isFlatPanel ? (
        <>
          <img
            src={teamBackgroundUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
            style={{
              maskImage:
                "linear-gradient(to bottom, black 0%, black 45%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 0%, black 45%, transparent 100%)",
            }}
          />
          <div className="absolute inset-0 bg-linear-to-b from-sidebar/40 via-sidebar/55 to-transparent" />
        </>
      ) : null}
      <m.div
        key={`${panelKey}-header`}
        className={cn(
          "relative z-10 flex w-full items-center",
          isSourceListHeader && "h-11 px-2",
          teamBackgroundUrl &&
            !showContextSidebar &&
            !isFlatPanel &&
            "[&_span]:text-sidebar-primary [&_button]:bg-sidebar/50 [&_button]:backdrop-blur-xs",
        )}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={motionBase}
      >
        {isFlatPanel ? (
          <FlatPanelHeaderContent flags={flags} onClose={onClose} />
        ) : showContextSidebar ? (
          <ContextPanelHeaderContent
            title={getContextSidebarTitle(contextSidebarMode)}
            headerAction={headerAction}
            onClose={onClose}
            onBackToMain={onBackToMain}
          />
        ) : (
          <RepoIdentityHeaderContent
            repo={repo}
            repoName={repoName}
            appName={appName}
            repoLogoUrl={repoLogoUrl}
            onClose={onClose}
          />
        )}
      </m.div>
    </div>
  );
}

function FlatPanelHeaderContent({
  flags,
  onClose,
}: {
  flags: SidebarPanelFlags;
  onClose: () => void;
}) {
  return (
    <>
      {/* pl-2 lines the title up with nav row icons (nav px-2 + row px-4). */}
      <span className="min-w-0 flex-1 truncate pl-2 text-base font-semibold tracking-[-0.02em] text-sidebar-primary">
        {getFlatPanelTitle(flags)}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        {flags.showGlobalSessionsPanel ? <SessionsSidebarOptionsMenu /> : null}
        {flags.showGlobalAutomationsPanel ? (
          <AutomationsSidebarOptionsMenu />
        ) : null}
        <Button
          size="icon-sm"
          variant="ghost"
          className="motion-press h-8 w-8 shrink-0 lg:hidden hover:scale-[1.03] active:scale-[0.96]"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <IconX size={16} className="text-muted-foreground" />
        </Button>
      </div>
    </>
  );
}

function ContextPanelHeaderContent({
  title,
  headerAction,
  onClose,
  onBackToMain,
}: {
  title: string;
  headerAction: ReactNode;
  onClose: () => void;
  onBackToMain: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onBackToMain}
        title="Back to main sidebar"
        aria-label="Back to main sidebar"
        className="absolute inset-0 rounded-menu-item hover:bg-sidebar-accent/50"
      />
      <span className="pointer-events-none relative z-10 flex size-8 shrink-0 items-center justify-center">
        <IconChevronLeft size={16} className="text-muted-foreground" />
      </span>
      <span className="pointer-events-none absolute inset-x-10 inset-y-0 flex items-center justify-center">
        <span className="max-w-full truncate text-base font-semibold tracking-[-0.02em] text-sidebar-primary">
          {title}
        </span>
      </span>
      <div className="relative z-10 ml-auto flex shrink-0 items-center">
        {headerAction}
        <Button
          size="icon-sm"
          variant="ghost"
          className="motion-press h-8 w-8 shrink-0 lg:hidden hover:scale-[1.03] active:scale-[0.96]"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <IconX size={16} className="text-muted-foreground" />
        </Button>
      </div>
    </>
  );
}

function RepoIdentityHeaderContent({
  repo,
  repoName,
  appName,
  repoLogoUrl,
  onClose,
}: {
  repo: RepoDoc | null | undefined;
  repoName: string | null;
  appName: string | undefined;
  repoLogoUrl: string | null | undefined;
  onClose: () => void;
}) {
  return (
    <>
      {repoName ? (
        <div
          className="flex min-w-0 flex-1 items-center justify-center gap-2"
          title={
            repo
              ? `${repoDisplayLabel(repo)} (${repo.owner}/${repo.name})`
              : appName
                ? `${repoName} / ${appName}`
                : repoName
          }
        >
          {/* Always reserve the logo slot so late logoUrl does not reflow the title. */}
          <RepoLogo
            logoUrl={repoLogoUrl}
            size={28}
            fallback={
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">
                {(repo ? repoDisplayLabel(repo) : (repoName ?? "?"))
                  .charAt(0)
                  .toUpperCase()}
              </span>
            }
          />
          <span className="min-w-0 truncate text-lg font-medium text-sidebar-primary">
            {repo
              ? repoDisplayLabel(repo)
              : appName
                ? `${repoName} / ${appName}`
                : repoName}
          </span>
        </div>
      ) : null}

      <Button
        size="icon"
        variant="ghost"
        className="motion-press shrink-0 lg:hidden hover:scale-[1.03] active:scale-[0.96]"
        onClick={onClose}
        aria-label="Close navigation"
      >
        <IconX size={18} className="text-muted-foreground" />
      </Button>
    </>
  );
}
