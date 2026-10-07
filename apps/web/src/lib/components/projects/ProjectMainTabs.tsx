"use client";

import { useNavigate } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@eva/ui";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import {
  SANDBOX_STATUS_STYLES,
  showsSandboxStatusDot,
} from "@/lib/components/sandbox/sandboxStatusStyles";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { UnreadDot } from "@/lib/components/ui/UnreadDot";

/** Primary project tabs. `work` is the index route, so it owns every deep link. */
export type ProjectMainTab = "overview" | "work" | "sandbox";

function isProjectMainTab(value: string): value is ProjectMainTab {
  return value === "overview" || value === "work" || value === "sandbox";
}

export function ProjectMainTabs({
  projectHref,
  activeTab,
  workTabLabel,
  showSandbox = false,
  isSandboxActive = false,
  isSandboxStarting = false,
  isSandboxStopping = false,
  hasUnread = false,
}: {
  /** Project base path, e.g. `/owner/repo/projects/3` (pre-internal form). */
  projectHref: string;
  activeTab: ProjectMainTab;
  /** "Tasks" for active projects, "Plan" while drafting. */
  workTabLabel: string;
  /** When true, Sandbox sits as a peer of Overview / Tasks. */
  showSandbox?: boolean;
  isSandboxActive?: boolean;
  isSandboxStarting?: boolean;
  isSandboxStopping?: boolean;
  /**
   * The project chat has an unseen reply. The chat lives on the sandbox tab,
   * so the dot shows only while another tab is open.
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
    liveStatus && showsSandboxStatusDot(liveStatus, simpleView)
      ? liveStatus
      : null;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        if (!isProjectMainTab(value)) return;
        const href =
          value === "overview"
            ? `${projectHref}/overview`
            : value === "sandbox"
              ? `${projectHref}/sandbox/preview`
              : projectHref;
        navigate({ to: toInternalRepoHref(href) });
      }}
    >
      {/* Centred in the page header — segmented so it matches other header
          switchers (sessions, quick tasks) and needs no hairline of its own. */}
      <TabsList
        size="sm"
        className="tabs-segmented"
        aria-label="Project view"
      >
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="work">{workTabLabel}</TabsTrigger>
        {showSandbox ? (
          <TabsTrigger value="sandbox" className="gap-1.5">
            Sandbox
            {sandboxStatus ? (
              <span
                className={`size-2 shrink-0 rounded-full ${SANDBOX_STATUS_STYLES[sandboxStatus].dot}`}
                title={SANDBOX_STATUS_STYLES[sandboxStatus].label}
                aria-label={SANDBOX_STATUS_STYLES[sandboxStatus].label}
              />
            ) : null}
            <UnreadDot show={hasUnread && activeTab !== "sandbox"} />
          </TabsTrigger>
        ) : null}
      </TabsList>
    </Tabs>
  );
}
