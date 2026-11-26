"use client";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { cn } from "@eva/ui";
import { IconPencil } from "@tabler/icons-react";
import {
  AutomationIcon,
  IconEva,
  InboxArrowIcon,
  SearchIcon,
  SidebarToggleIcon,
  TerminalIcon,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  ErrorBoundary,
  CountPop,
  countLabel,
  CORNER_BADGE_CLASS,
  UnreadCornerBadge,
  Sidebar,
  shellDockTileProps,
} from "@vvedantb/ui";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { RepoLabelDialog } from "@/lib/components/RepoLabelDialog";
import { RailAppHotkeys } from "@/lib/components/sidebar/RailAppHotkeys";
import { RailSettingsMenu } from "@/lib/components/sidebar/RailSettingsMenu";
import { SidebarUserMenu } from "@/lib/components/sidebar/SidebarUserMenu";
import { ShortcutKbd } from "@/lib/components/ui/Kbd";
import { useSidebar } from "@/lib/contexts/SidebarContext";
import { useSearch } from "@/lib/contexts/SearchContext";
import { isHomePath } from "@/lib/components/sidebar/homePaths";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { repoSectionFromPath, repoSectionHref } from "@/lib/utils/repoUrl";
import { repoTileColor } from "@/lib/utils/repoTileColor";
import {
  appLeafName,
  appMatchesLabel,
  repoDisplayLabel,
  type RepoWithLogo,
} from "@/lib/utils/repoGrouping";

interface RepoRailProps {
  repos: RepoWithLogo[];
  currentOwner: string | null;
  currentName: string | null;
  currentAppName: string | undefined;
  pathname: string;
  onNavigate: () => void;
  userName: string;
  showSearch?: boolean;
}

function isRowActive(
  row: RepoWithLogo,
  owner: string | null,
  name: string | null,
  appName: string | undefined,
): boolean {
  if (row.owner !== owner || row.name !== name) return false;
  if (row.rootDirectory) {
    return appName !== undefined && appMatchesLabel(row, appName);
  }
  return appName === undefined;
}

const CUTOUT_COLOR = "var(--segment)";

const RAIL_BADGE_LIVE_CLASS = cn(CORNER_BADGE_CLASS, "bg-success text-white");

function InboxNeedsYouBadge() {
  return <UnreadCornerBadge count={useQuery(api.needsYou.list, {})?.length} />;
}

function AutomationsUnreadBadge() {
  return <UnreadCornerBadge count={useQuery(api.automations.countUnreadAll)} />;
}

type SandboxCounts = ReadonlyMap<Id<"githubRepos">, number>;

const EMPTY_SANDBOX_COUNTS: SandboxCounts = new Map();

function RepoRailLiveData(props: RepoRailProps) {
  const activeSessionCount = useQuery(api.githubRepos.countActiveSessions);
  const sandboxCounts = useQuery(api.githubRepos.listActiveSandboxCounts);
  const activeSandboxCounts: SandboxCounts = new Map(
    (sandboxCounts ?? []).map((entry): [Id<"githubRepos">, number] => [
      entry.repoId,
      entry.count,
    ]),
  );

  return (
    <RepoRailView
      {...props}
      activeSessionCount={activeSessionCount}
      activeSandboxCounts={activeSandboxCounts}
    />
  );
}

/**
 * Far-left icon rail: global destinations (Eva, Inbox, Sessions), then repos,
 * then Automations / collapse / search / account / settings at the bottom.
 * Teams and Artifacts live in the workspace sidebar behind the Eva tile;
 * Testing (dev) lives in the Settings sidebar. The gear goes straight to the
 * first Settings route (Theme).
 * App tiles are real Links (not buttons) so middle-click / cmd-click open a new tab.
 *
 * Live session/sandbox indicators sit behind ErrorBoundary so a missing
 * Convex function cannot swap the whole shell. Simple view wakes sandboxes from
 * the Preview tab, so it shows no awake counts and skips both queries.
 */
export function RepoRail(props: RepoRailProps) {
  const simpleView = useSimpleView();
  const withoutCounts = (
    <RepoRailView
      {...props}
      activeSessionCount={undefined}
      activeSandboxCounts={EMPTY_SANDBOX_COUNTS}
    />
  );
  if (simpleView) return withoutCounts;
  return (
    <ErrorBoundary fallback={withoutCounts}>
      <RepoRailLiveData {...props} />
    </ErrorBoundary>
  );
}

interface RepoRailViewProps extends RepoRailProps {
  activeSessionCount: number | undefined;
  activeSandboxCounts: SandboxCounts;
}

function RepoRailView({
  repos,
  currentOwner,
  currentName,
  currentAppName,
  pathname,
  onNavigate,
  userName,
  showSearch,
  activeSessionCount,
  activeSandboxCounts,
}: RepoRailViewProps) {
  const { collapsed, setCollapsed, setSessionsNavMode } = useSidebar();
  const { openSearch } = useSearch();
  const simpleView = useSimpleView();
  const homeActive =
    pathname === "/" || pathname.startsWith("/setup") || isHomePath(pathname);
  const inboxActive = pathname === "/inbox" || pathname.startsWith("/inbox/");
  const pathParts = pathname.split("/").filter(Boolean);
  const onRepoSessionsPath =
    pathParts.includes("sessions") && pathParts[0] !== "sessions";
  const sessionsActive =
    pathname === "/sessions" ||
    pathname.startsWith("/sessions/") ||
    onRepoSessionsPath;
  const automationsActive =
    pathname === "/automations" ||
    pathname.startsWith("/automations/") ||
    (pathParts.includes("automations") && pathParts[0] !== "automations");
  const sessionsLabel = countLabel(activeSessionCount);
  const [renameRepo, setRenameRepo] = useState<RepoWithLogo | null>(null);
  const currentSection = repoSectionFromPath(pathname);
  const railHref = (row: RepoWithLogo): string =>
    repoSectionHref(row.owner, row.name, row.rootDirectory, currentSection);

  return (
    <Sidebar.Rail>
      <RailAppHotkeys
        repos={repos}
        section={currentSection}
        onNavigate={onNavigate}
      />
      <Sidebar.RailHeader>
        <Sidebar.RailGroup>
          <Sidebar.RailItem
            asChild
            label="Eva home"
            tooltip="Home"
            active={homeActive}
          >
            <Link to="/home" onClick={onNavigate}>
              <IconEva size={22} className="shrink-0" />
            </Link>
          </Sidebar.RailItem>
          <Sidebar.RailItem asChild label="Inbox" active={inboxActive}>
            <Link to="/inbox" onClick={onNavigate}>
              <InboxArrowIcon
                size={22}
                active={inboxActive}
                cutoutColor={CUTOUT_COLOR}
                className="shrink-0"
              />
              <ErrorBoundary>
                <InboxNeedsYouBadge />
              </ErrorBoundary>
            </Link>
          </Sidebar.RailItem>
          <Sidebar.RailItem
            asChild
            label={
              sessionsLabel ? `Sessions, ${sessionsLabel} active` : "Sessions"
            }
            tooltip={sessionsLabel ? `Sessions (${sessionsLabel})` : "Sessions"}
            active={sessionsActive}
          >
            <Link
              to="/sessions"
              onClick={() => {
                setSessionsNavMode("global");
                onNavigate();
              }}
            >
              <TerminalIcon
                size={22}
                active={sessionsActive}
                cutoutColor={CUTOUT_COLOR}
                className="shrink-0"
              />
              <CountPop
                label={sessionsLabel}
                className={RAIL_BADGE_LIVE_CLASS}
              />
            </Link>
          </Sidebar.RailItem>
        </Sidebar.RailGroup>
      </Sidebar.RailHeader>
      <Sidebar.RailBody className="scrollbar scroll-fade justify-center-safe max-md:overscroll-y-contain">
        {repos.length === 0 ? null : (
          <Sidebar.RailGroup>
            {repos.map((row, index) => {
              const displayName = repoDisplayLabel(row);
              const hotkeySlot = index < 9 ? index + 1 : null;
              const active =
                !sessionsActive &&
                !automationsActive &&
                isRowActive(row, currentOwner, currentName, currentAppName);
              const tooltip = simpleView
                ? displayName
                : `${displayName} · ${row.owner}/${row.name}`;
              const sandboxCount = activeSandboxCounts.get(row._id);
              const sandboxLabel = countLabel(sandboxCount);
              const tileColor = repoTileColor(
                `${row.owner}/${row.name}/${displayName}`,
              );

              return (
                <ContextMenu key={row._id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ContextMenuTrigger asChild>
                        <Sidebar.RailItem
                          asChild
                          showTooltip={false}
                          label={
                            sandboxLabel === null
                              ? tooltip
                              : `${tooltip}, ${sandboxLabel} ${
                                  sandboxCount === 1 ? "sandbox" : "sandboxes"
                                } active`
                          }
                          active={active}
                          className={active ? undefined : "opacity-50"}
                        >
                          <Link to={railHref(row)} onClick={onNavigate}>
                            <RepoLogo
                              logoUrl={row.logoUrl}
                              size={30}
                              fallback={
                                <span
                                  className={cn(
                                    "flex size-[30px] items-center justify-center rounded-md text-sm font-semibold",
                                    tileColor.bg,
                                    tileColor.text,
                                  )}
                                >
                                  {displayName.charAt(0).toUpperCase()}
                                </span>
                              }
                            />
                            <CountPop
                              label={sandboxLabel}
                              className={RAIL_BADGE_LIVE_CLASS}
                            />
                          </Link>
                        </Sidebar.RailItem>
                      </ContextMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="flex items-center gap-2"
                    >
                      {tooltip}
                      {hotkeySlot !== null && !simpleView ? (
                        <ShortcutKbd id="jumpToApp" slot={hotkeySlot} />
                      ) : null}
                    </TooltipContent>
                  </Tooltip>
                  <ContextMenuContent onClick={(e) => e.stopPropagation()}>
                    <ContextMenuItem onClick={() => setRenameRepo(row)}>
                      <IconPencil size={16} />
                      Rename
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </Sidebar.RailGroup>
        )}
      </Sidebar.RailBody>
      {renameRepo ? (
        <RepoLabelDialog
          open
          onOpenChange={(open) => {
            if (!open) setRenameRepo(null);
          }}
          repoId={renameRepo._id}
          label={renameRepo.label}
          fallbackName={appLeafName(renameRepo)}
        />
      ) : null}
      <Sidebar.RailFooter>
        <Sidebar.RailGroup>
          {simpleView ? null : (
            <Sidebar.RailItem
              asChild
              label="Automations"
              active={automationsActive}
            >
              <Link to="/automations" onClick={onNavigate}>
                <AutomationIcon
                  size={22}
                  active={automationsActive}
                  cutoutColor={CUTOUT_COLOR}
                  className="shrink-0"
                />
                <ErrorBoundary>
                  <AutomationsUnreadBadge />
                </ErrorBoundary>
              </Link>
            </Sidebar.RailItem>
          )}
          <Sidebar.RailItem
            {...shellDockTileProps}
            label={collapsed ? "Show sidebar" : "Hide sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            <SidebarToggleIcon
              size={22}
              collapsed={collapsed}
              className="shrink-0"
            />
          </Sidebar.RailItem>
          <Tooltip>
            <TooltipTrigger asChild>
              <Sidebar.RailItem
                label="Search"
                showTooltip={false}
                onClick={() => openSearch()}
              >
                <SearchIcon size={22} className="shrink-0" />
              </Sidebar.RailItem>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-2">
              Search
              {simpleView ? null : <ShortcutKbd id="openSearch" />}
            </TooltipContent>
          </Tooltip>
          <SidebarUserMenu name={userName} showSearch={showSearch} />
          <RailSettingsMenu onNavigate={onNavigate} />
        </Sidebar.RailGroup>
      </Sidebar.RailFooter>
    </Sidebar.Rail>
  );
}
