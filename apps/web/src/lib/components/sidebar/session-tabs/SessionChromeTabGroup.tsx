"use client";

import { useNavigate } from "@tanstack/react-router";
import type { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { Spinner, cn } from "@eva/ui";
import { RepoLogo } from "@/lib/components/RepoLogo";
import {
  repoBasePaths,
  sessionMatchesPath,
} from "@/lib/components/sidebar/_utils/repoSessionPaths";
import { sortSessionsForSidebar } from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";
import {
  SessionChromeTabStrip,
  type ChromeTabEntry,
} from "@/lib/components/sidebar/session-tabs/SessionChromeTabStrip";
import { mergeSessionTabOrder } from "@/lib/components/sidebar/session-tabs/sessionTabOrder";
import { tabGroupColorForId } from "@/lib/components/sidebar/session-tabs/tabGroupColors";
import { useClosedSessionTabs } from "@/lib/components/sidebar/session-tabs/useClosedSessionTabs";
import { useSessionTabOrder } from "@/lib/components/sidebar/session-tabs/useSessionTabOrder";
import { entityPathSegment } from "@/lib/numId";
import { repoDisplayLabel, type RepoWithLogo } from "@/lib/utils/repoGrouping";
import { isSessionSidebarActive } from "@/routes/_repo/$owner/$repo/sessions/_utils/sessionReadOnly";

type SessionListItem = FunctionReturnType<typeof api.sessions.list>[number];

interface SessionChromeTabGroupProps {
  repo: RepoWithLogo;
  pathname: string;
  /**
   * This app's active sessions, already watched once by the tab bar. The group
   * used to run its own `sessions.list` watch through a different cache, so
   * every app in the strip held two live subscriptions to the same rows.
   */
  activeSessions: SessionListItem[] | undefined;
  /** Collapsed groups show only the pill (plus the tab you are looking at). */
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRenameRequest: (session: SessionListItem, repo: RepoWithLogo) => void;
  onArchiveRequest: (session: SessionListItem, repo: RepoWithLogo) => void;
  /** When true, hide the group if it has no active tabs. */
  hideWhenEmpty?: boolean;
}

/**
 * Chrome tab group: a group-name pill, that app's active session tabs, and the
 * coloured line Chrome draws underneath to tie them together. Selection is
 * resolved here rather than per tab so a tab knows whether its neighbour is
 * selected — Chrome drops the separator hairline next to the selected tab.
 *
 * Clicking the pill collapses the group to a chip, as in Chrome. A collapsed
 * group still shows the selected tab: hiding the session you are reading would
 * leave the strip claiming you are nowhere.
 */
export function SessionChromeTabGroup({
  repo,
  pathname,
  activeSessions,
  isOpen,
  onOpenChange,
  onRenameRequest,
  onArchiveRequest,
  hideWhenEmpty = true,
}: SessionChromeTabGroupProps) {
  const navigate = useNavigate();
  const { isClosed, close } = useClosedSessionTabs();
  const { orderFor, setOrderFor } = useSessionTabOrder();
  const label = repoDisplayLabel(repo);
  const baseUrl = `${repoBasePaths(repo)[0]}/sessions`;
  const colors = tabGroupColorForId(repo._id);
  const isLoading = activeSessions === undefined;
  // Creation order, with the user's own drag order on top. Sorting by activity
  // moved the tab out from under the pointer every time an agent finished a
  // turn somewhere else in the strip.
  const tabs: ChromeTabEntry[] = mergeSessionTabOrder(
    sortSessionsForSidebar(
      (activeSessions ?? []).filter(isSessionSidebarActive),
      "created_at",
    ),
    orderFor(repo._id),
  ).map((session) => {
    const pathSegment = entityPathSegment(session);
    const href = pathSegment ? `${baseUrl}/${pathSegment}` : baseUrl;
    return {
      session,
      href,
      isSelected: sessionMatchesPath(repo, pathSegment, pathname),
    };
  });

  if (hideWhenEmpty && !isLoading && tabs.length === 0) {
    return null;
  }

  // A closed tab stays out of the strip until it is opened again from the
  // overflow menu — except the session being read, which is always shown.
  const openTabs = tabs.filter(
    (tab) => tab.isSelected || !isClosed(tab.session._id),
  );
  const visibleTabs = isOpen
    ? openTabs
    : openTabs.filter((tab) => tab.isSelected);

  /** Closing the tab you are reading hands the page to its neighbour. */
  const handleClose = (entry: ChromeTabEntry) => {
    close(entry.session._id);
    if (!entry.isSelected) return;
    const next = openTabs.find(
      (tab) => tab.session._id !== entry.session._id,
    );
    navigate({ to: next ? next.href : "/sessions" });
  };

  return (
    // Only open groups give up width — their tabs shrink first, so a collapsed
    // chip never loses characters to someone else's tabs.
    <div
      className={cn(
        // Same horizontal padding open or collapsed so expanding a group does
        // not shift neighbouring pills. Nothing clips: the selected tab's
        // flared shoulders reach past the group's edge by design.
        "relative flex items-end gap-2 px-0.5",
        isOpen ? "min-w-0" : "shrink-0",
      )}
    >
      {/* Chrome marks a group with a coloured line beneath it — no tinted fill
          behind the tabs. The selected tab's card covers the line it crosses.
          Collapsed chips are just the pill (+ selected tab), so no underline. */}
      {isOpen ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-0 bottom-0 h-[3px] rounded-t-sm",
            colors.underline,
          )}
        />
      ) : null}
      {/* Group label pill — Chrome puts the name first, then its tabs. The row
          is tab-height so a collapsed chip lines up with expanded groups. */}
      <div className="flex h-9 shrink-0 items-center">
        <button
          type="button"
          aria-expanded={isOpen}
          title={isOpen ? `Collapse ${label}` : `Expand ${label}`}
          className={cn(
            // Never shrinks: the app name is the group's identity, so width
            // pressure goes to the tabs instead.
            "flex max-w-44 shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-85",
            colors.pill,
          )}
          onClick={() => {
            onOpenChange(!isOpen);
          }}
        >
          <RepoLogo
            logoUrl={repo.logoUrl}
            size={14}
            className="border-0"
            fallback={
              <span className="flex size-3.5 shrink-0 items-center justify-center rounded-sm bg-background/40 text-[8px] font-semibold">
                {label.charAt(0).toUpperCase()}
              </span>
            }
          />
          <span className="truncate">{label}</span>
        </button>
      </div>
      {isLoading ? (
        <div className="flex h-9 items-center px-3">
          <Spinner size="sm" />
        </div>
      ) : (
        <SessionChromeTabStrip
          repo={repo}
          baseUrl={baseUrl}
          groupColor={colors}
          tabs={tabs}
          visibleTabs={visibleTabs}
          onReorder={(orderedIds) => setOrderFor(repo._id, orderedIds)}
          onRenameRequest={(session) => onRenameRequest(session, repo)}
          onArchiveRequest={(session) => onArchiveRequest(session, repo)}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
