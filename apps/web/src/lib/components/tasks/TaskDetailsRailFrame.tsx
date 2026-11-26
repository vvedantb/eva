"use client";

import type { ReactNode } from "react";
import { IconWorld, IconWorldFilled } from "@tabler/icons-react";
import { SidePanelTabs, useMediaQuery } from "@vvedantb/ui";
import {
  SandboxTabTrigger,
  type SandboxTabDescriptor,
} from "@/routes/_repo/$owner/$repo/sessions/_components/SandboxTabTrigger";
import { SandboxPanelFrame } from "@/lib/components/sandbox/SandboxPanelFrame";
import { KeepAlivePane } from "@/lib/components/sandbox/KeepAlivePane";
import { useSandboxRailLabels } from "@/lib/components/sandbox/useSandboxRailLabels";
import { TASK_DETAILS_TAB, type TaskDetailsTab } from "./TaskDetailsPane";

const PREVIEW_TAB: SandboxTabDescriptor = {
  value: "preview",
  label: "Preview",
  icon: { kind: "component", Icon: IconWorld, ActiveIcon: IconWorldFilled },
};

/**
 * A project task's right pane before its sandbox exists: a rail with Details
 * and Preview, where Preview holds the "no sandbox yet" state (`children`).
 * Once the sandbox exists, `TaskSandboxPanel` shows the full rail with
 * Details first.
 */
export function TaskDetailsRailFrame({
  activeTab,
  onTabChange,
  collapsed,
  onToggle,
  details,
  children,
}: {
  activeTab: TaskDetailsTab | "preview";
  onTabChange: (tab: TaskDetailsTab | "preview") => void;
  collapsed: boolean;
  onToggle: () => void;
  details: ReactNode;
  children: ReactNode;
}) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { showLabels } = useSandboxRailLabels();
  const layout = isMobile ? "row" : showLabels ? "stacked" : "icon";

  return (
    <SandboxPanelFrame
      collapsed={collapsed}
      tabBar={
        <SidePanelTabs.Rail labelled={showLabels}>
          <SidePanelTabs.List
            value={activeTab}
            labelled={showLabels}
            onValueChange={(value) => {
              onTabChange(
                value === TASK_DETAILS_TAB.value
                  ? TASK_DETAILS_TAB.value
                  : "preview",
              );
              if (collapsed) onToggle();
            }}
          >
            {[TASK_DETAILS_TAB, PREVIEW_TAB].map((tab) => (
              <SandboxTabTrigger
                key={tab.value}
                tab={tab}
                layout={layout}
                onReselect={isMobile ? undefined : onToggle}
              />
            ))}
          </SidePanelTabs.List>
        </SidePanelTabs.Rail>
      }
    >
      <div className="h-full overflow-hidden">
        <KeepAlivePane
          active={activeTab === TASK_DETAILS_TAB.value}
          className="flex h-full min-h-0 flex-col overflow-hidden"
        >
          {details}
        </KeepAlivePane>
        <div className={activeTab === "preview" ? "h-full" : "hidden"}>
          {children}
        </div>
      </div>
    </SandboxPanelFrame>
  );
}
