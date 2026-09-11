"use client";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@eva/ui";
import { IconPencil } from "@tabler/icons-react";
import {
  AutomationsIcon,
  InboxIcon,
  SearchIcon,
  SessionsIcon,
  SidebarCollapseIcon,
} from "@/lib/components/sidebar/icons/AnimatedNavIcons";
import { LogoMark } from "@/lib/components/LogoMark";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { RepoLabelDialog } from "@/lib/components/RepoLabelDialog";
import { RailAppHotkeys } from "@/lib/components/sidebar/RailAppHotkeys";
import { RailSettingsMenu } from "@/lib/components/sidebar/RailSettingsMenu";
import { SidebarUserMenu } from "@/lib/components/sidebar/SidebarUserMenu";
import { QueryErrorBoundary } from "@/lib/components/QueryErrorBoundary";
import { ShortcutKbd } from "@/lib/components/ui/Kbd";
import { CountPop, countLabel } from "@/lib/components/ui/CountPop";
import { railTileActiveClass } from "@/lib/components/sidebar/SharedLayoutNav";
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

const RAIL_TILE_CLASS =
  "relative flex size-11 items-center justify-center rounded-lg border motion-press active:scale-[0.96] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring/35";

function railTileActive(active: boolean): string {
  return active
    ? railTileActiveClass
    : "border-transparent text-muted-foreground opacity-75 hover:bg-sidebar-accent/50 hover:opacity-100 hover:text-sidebar-foreground";
}

/**
 * Shape and placement of every count badge on a rail tile; the tone (unread vs
 * live) is the caller's single extra class. Kept in one place so the unread
 * dots, the sessions count and the per-app sandbox count cannot drift apart.
 */
const RAIL_BADGE_CLASS =
  "absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none";

/** Green: something is running right now (sessions, sandboxes). */
const RAIL_BADGE_LIVE_CLASS = cn(RAIL_BADGE_CLASS, "bg-success text-white");

/**
 * The unread dot on a rail tile. One component for both counters — they were two
 * byte-identical copies differing only in the query. The pop itself lives in
 * `CountPop`, shared with the drafts pill and the running-sessions count.
 */
function RailUnreadBadge({ count }: { count: number | undefined }) {
  return (
    <CountPop
      label={countLabel(count)}
      className={cn(RAIL_BADGE_CLASS, "bg-primary text-primary-foreground")}
    />
  );
}

function InboxUnreadBadge() {
  return <RailUnreadBadge count={useQuery(api.notifications.countUnread)} />;
}

function AutomationsUnreadBadge() {
  return <RailUnreadBadge count={useQuery(api.automations.countUnreadAll)} />;
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
 * Live session/sandbox indicators sit behind QueryErrorBoundary so a missing
 * Convex function cannot swap the whole shell.
 */
export function RepoRail(props: RepoRailProps) {
  return (
    <QueryErrorBoundary
      fallback={
        <RepoRailView
          {...props}
          activeSessionCount={undefined}
          activeSandboxCounts={EMPTY_SANDBOX_COUNTS}
        />
      }
    >
      <RepoRailLiveData {...props} />
    </QueryErrorBoundary>
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
    <div className="flex h-full w-16 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar">
      <RailAppHotkeys
        repos={repos}
        section={currentSection}
        onNavigate={onNavigate}
      />
      <div className="flex w-full flex-col items-center gap-1.5 px-0 pt-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/home"
              onClick={onNavigate}
              aria-label="Eva home"
              className={cn(RAIL_TILE_CLASS, railTileActive(homeActive))}
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-white">
                <LogoMark size={20} className="shrink-0" />
              </span>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Home</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/inbox"
              onClick={onNavigate}
              aria-label="Inbox"
              className={cn(
                RAIL_TILE_CLASS,
                "group",
                railTileActive(inboxActive),
              )}
            >
              <InboxIcon size={22} className="shrink-0" />
              <QueryErrorBoundary>
                <InboxUnreadBadge />
              </QueryErrorBoundary>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Inbox</TooltipContent>
        </Tooltip>
        <div className="h-px w-8 bg-sidebar-border" aria-hidden />
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/sessions"
              onClick={() => {
                setSessionsNavMode("global");
                onNavigate();
              }}
              aria-label={
                sessionsLabel ? `Sessions, ${sessionsLabel} active` : "Sessions"
              }
              className={cn(
                RAIL_TILE_CLASS,
                "group",
                railTileActive(sessionsActive),
              )}
            >
              <SessionsIcon size={22} className="shrink-0" />
              <CountPop
                label={sessionsLabel}
                className={RAIL_BADGE_LIVE_CLASS}
              />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">
            {sessionsLabel ? `Sessions (${sessionsLabel})` : "Sessions"}
          </TooltipContent>
        </Tooltip>
        {/* Manager Ave used to sit here. It now lives in the floating launcher
            (`AveLauncherProvider`), which owns the orchestrator query too. */}
        <div className="h-px w-8 bg-sidebar-border" aria-hidden />
      </div>
      <div className="scrollbar scroll-fade flex w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto py-2">
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

          return (
            <ContextMenu key={row._id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ContextMenuTrigger asChild>
                    <Link
                      to={railHref(row)}
                      onClick={onNavigate}
                      aria-label={
                        sandboxLabel === null
                          ? tooltip
                          : `${tooltip}, ${sandboxLabel} ${
                              sandboxCount === 1 ? "sandbox" : "sandboxes"
                            } active`
                      }
                      className={cn(
                        RAIL_TILE_CLASS,
                        active
                          ? cn(railTileActiveClass, "opacity-100")
                          : "border-transparent opacity-50 hover:bg-sidebar-accent/50 hover:opacity-100",
                      )}
                    >
                      <RepoLogo
                        logoUrl={row.logoUrl}
                        size={30}
                        fallback={
                          <span
                            className={cn(
                              "flex size-[30px] items-center justify-center rounded-md text-sm font-semibold text-white",
                              repoTileColor(
                                `${row.owner}/${row.name}/${displayName}`,
                              ),
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
      </div>
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
      <div className="flex w-full flex-col items-center gap-1.5 border-t border-sidebar-border py-3">
        {simpleView ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/automations"
                onClick={onNavigate}
                aria-label="Automations"
                className={cn(
                  RAIL_TILE_CLASS,
                  "group",
                  railTileActive(automationsActive),
                )}
              >
                <AutomationsIcon size={22} className="shrink-0" />
                <QueryErrorBoundary>
                  <AutomationsUnreadBadge />
                </QueryErrorBoundary>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Automations</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
              title={collapsed ? "Show sidebar" : "Hide sidebar"}
              className={cn(
                RAIL_TILE_CLASS,
                "group border-transparent text-muted-foreground opacity-75 hover:bg-sidebar-accent/50 hover:opacity-100 hover:text-sidebar-foreground",
              )}
            >
              <SidebarCollapseIcon
                size={22}
                collapsed={collapsed}
                className="shrink-0"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Show sidebar" : "Hide sidebar"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => openSearch()}
              aria-label="Search"
              title="Search"
              className={cn(
                RAIL_TILE_CLASS,
                "group border-transparent text-muted-foreground opacity-75 hover:bg-sidebar-accent/50 hover:opacity-100 hover:text-sidebar-foreground",
              )}
            >
              <SearchIcon size={22} className="shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            Search
            {simpleView ? null : <ShortcutKbd id="openSearch" />}
          </TooltipContent>
        </Tooltip>
        <SidebarUserMenu name={userName} showSearch={showSearch} />
        <RailSettingsMenu onNavigate={onNavigate} />
      </div>
    </div>
  );
}
