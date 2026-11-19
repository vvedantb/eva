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
} from "@vvedantb/ui";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { RepoLabelDialog } from "@/lib/components/RepoLabelDialog";
import { RailAppHotkeys } from "@/lib/components/sidebar/RailAppHotkeys";
import { RailSettingsMenu } from "@/lib/components/sidebar/RailSettingsMenu";
import { SidebarUserMenu } from "@/lib/components/sidebar/SidebarUserMenu";
import { ShortcutKbd } from "@/lib/components/ui/Kbd";
import { railGroupThemeClass } from "@/lib/components/sidebar/SharedLayoutNav";
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

/** Whether a repo row (root repo or monorepo app) matches the active URL. */
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

/**
 * Cut-out tone for the solid active rail icons: the active pill's fill
 * (`.rail-track > .t-tabs-pill`), so the cut-out reads as a hole in the icon.
 */
const CUTOUT_COLOR = "rgb(var(--segment-active) / 1)";

/** Green: something is running right now (sessions, sandboxes). */
const RAIL_BADGE_LIVE_CLASS = cn(CORNER_BADGE_CLASS, "bg-success text-white");

function InboxUnreadBadge() {
  return <UnreadCornerBadge count={useQuery(api.notifications.countUnread)} />;
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
  // The Eva tile owns the home panel (Codebases / Teams / Artifacts),
  // so it stays lit on any of those routes.
  const homeActive =
    pathname === "/" || pathname.startsWith("/setup") || isHomePath(pathname);
  const inboxActive = pathname === "/inbox" || pathname.startsWith("/inbox/");
  const pathParts = pathname.split("/").filter(Boolean);
  const onRepoSessionsPath =
    pathParts.includes("sessions") && pathParts[0] !== "sessions";
  // Deep session links always belong to the root Sessions rail entry (no
  // per-app sessions sidebar), so highlight Sessions whenever the path is one.
  const sessionsActive =
    pathname === "/sessions" ||
    pathname.startsWith("/sessions/") ||
    onRepoSessionsPath;
  // Deep automation links belong to the root Automations rail entry too.
  const automationsActive =
    pathname === "/automations" ||
    pathname.startsWith("/automations/") ||
    (pathParts.includes("automations") && pathParts[0] !== "automations");
  const sessionsLabel = countLabel(activeSessionCount);
  const [renameRepo, setRenameRepo] = useState<RepoWithLogo | null>(null);
  // Carry the section (Quick Tasks, Projects, …) across an app switch, but not
  // the entity below it: task 204 belongs to the app you are leaving.
  const currentSection = repoSectionFromPath(pathname);
  // Plain `string`, not a template-literal type: `<Link to>` is a union of
  // known route paths and rejects the narrowed form.
  const railHref = (row: RepoWithLogo): string =>
    repoSectionHref(row.owner, row.name, row.rootDirectory, currentSection);

  return (
    <Sidebar.Rail>
      <RailAppHotkeys
        repos={repos}
        section={currentSection}
        onNavigate={onNavigate}
      />
      {/* Three package rail groups: a shared trough each, with one pill that
          slides to the active tile. The gaps divide them, so there are no rules. */}
      <Sidebar.RailHeader>
        <Sidebar.RailGroup className={railGroupThemeClass}>
          <Sidebar.RailItem
            asChild
            label="Eva home"
            tooltip="Home"
            active={homeActive}
          >
            <Link to="/home" onClick={onNavigate}>
              {/* The package app glyph at the rail icon size (22): no disc, so
                  the group's pill shows behind it when Home is active. */}
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
                <InboxUnreadBadge />
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
          {/* Manager Ave used to sit here. It now lives in the floating launcher
            (`AveLauncherProvider`), which owns the orchestrator query too. */}
        </Sidebar.RailGroup>
      </Sidebar.RailHeader>
      {/* Drawer below `md`: keep a scroll here off the page behind.
          `justify-center-safe` centres the repo group, but a list taller than
          the rail starts at the top so its first tiles stay reachable. */}
      <Sidebar.RailBody className="scrollbar scroll-fade justify-center-safe max-md:overscroll-y-contain">
        {repos.length === 0 ? null : (
          <Sidebar.RailGroup className={railGroupThemeClass}>
            {repos.map((row, index) => {
              const displayName = repoDisplayLabel(row);
              // Mirrors RailAppHotkeys: only the first nine tiles get a slot.
              const hotkeySlot = index < 9 ? index + 1 : null;
              // While the global Sessions destination is highlighted, don't also
              // light up a repo tile — the rail should show one active target.
              const active =
                !sessionsActive &&
                !automationsActive &&
                isRowActive(row, currentOwner, currentName, currentAppName);
              // Simple view hides keycap hints and the GitHub `owner/repo`
              // identifier; the hotkeys themselves still work.
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
                  {/* Eva's tooltip, not the tile's: it shows the hotkey keycap. */}
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
                          // Idle app logos sit further back than the icon tiles.
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
        <Sidebar.RailGroup className={railGroupThemeClass}>
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
            data-sidebar-dock-tile
            label={collapsed ? "Show sidebar" : "Hide sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            <SidebarToggleIcon
              size={22}
              collapsed={collapsed}
              className="shrink-0"
            />
          </Sidebar.RailItem>
          {/* Eva's tooltip, not the tile's: it shows the shortcut keycap. */}
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
