"use client";

import { useNavigate } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, UnreadDot } from "@vvedantb/ui";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import {
  SANDBOX_STATUS_STYLES,
  showsSandboxStatusDot,
} from "@/lib/components/sandbox/sandboxStatusStyles";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

/**
 * Primary project tabs, in their on-screen order (the content slides by it):
 * Project (the overview), and the work tab — the coordinator (its chat and
 * rail, Tasks first) or, while a project still plans, its Plan.
 * `work` is the index route, so it owns every deep link.
 */
export const PROJECT_MAIN_TABS = ["overview", "work"] as const;
export type ProjectMainTab = (typeof PROJECT_MAIN_TABS)[number];

function isProjectMainTab(value: string): value is ProjectMainTab {
  return PROJECT_MAIN_TABS.some((tab) => tab === value);
}

export function ProjectMainTabs({
  projectHref,
  activeTab,
  workTabLabel,
  showSandboxStatus = false,
  isSandboxActive = false,
  isSandboxStarting = false,
  isSandboxStopping = false,
  hasUnread = false,
}: {
  /** Project base path, e.g. `/owner/repo/projects/3` (pre-internal form). */
  projectHref: string;
  activeTab: ProjectMainTab;
  /** "Sandbox" for active projects, "Plan" while drafting. */
  workTabLabel: string;
  /** The work tab is the coordinator: it carries its sandbox status dot. */
  showSandboxStatus?: boolean;
  isSandboxActive?: boolean;
  isSandboxStarting?: boolean;
  isSandboxStopping?: boolean;
  /**
   * The coordinator chat has an unseen reply. The chat lives on the work
   * tab, so the dot shows only while Project is open.
   */
  hasUnread?: boolean;
}) {
  const navigate = useNavigate();
  const simpleView = useSimpleView();

  // `stopping` outranks `starting` outranks `active`: a stale `isSandboxActive`
  // can still read true while the sandbox is on its way up or down.
  const liveStatus = isSandboxStopping
    ? "stopping"
    : isSandboxStarting && !isSandboxActive
      ? "starting"
      : isSandboxActive
        ? "active"
        : null;
  const sandboxStatus =
    showSandboxStatus &&
    liveStatus &&
    showsSandboxStatusDot(liveStatus, simpleView)
      ? liveStatus
      : null;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        if (!isProjectMainTab(value)) return;
        const href =
          value === "overview" ? `${projectHref}/overview` : projectHref;
        navigate({ to: toInternalRepoHref(href) });
      }}
    >
      {/* Centred in the page header — segmented so it matches other header
          switchers (sessions, quick tasks) and needs no hairline of its own. */}
      <TabsList size="sm" className="tabs-segmented" aria-label="Project view">
        <TabsTrigger value="overview">Project</TabsTrigger>
        <TabsTrigger value="work" className="gap-1.5">
          {workTabLabel}
          {sandboxStatus ? (
            <span
              className={`size-2 shrink-0 rounded-full ${SANDBOX_STATUS_STYLES[sandboxStatus].dot}`}
              title={SANDBOX_STATUS_STYLES[sandboxStatus].label}
              aria-label={SANDBOX_STATUS_STYLES[sandboxStatus].label}
            />
          ) : null}
          <UnreadDot show={hasUnread && activeTab !== "work"} />
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
