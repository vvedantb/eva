"use client";

import { useState, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import {
  MobilePaneSwitcher,
  type MobilePaneLabels,
} from "@/lib/components/MobilePaneSwitcher";
import {
  LEFT_PANEL_ID,
  RIGHT_PANEL_ID,
  usePersistentPanelSize,
} from "@/lib/hooks/usePersistentPanelSize";
import { useMediaQuery } from "@vvedantb/ui";

interface ResizableSidebarProps {
  sidebar: ReactNode;
  children: ReactNode;
  storageKey: string;
  defaultWidth?: string;
  minSidebarWidthPx?: number;
  minContentWidthPx?: number;
  mobilePaneLabels?: MobilePaneLabels;
  side?: "left" | "right";
  showContentSignal?: number;
}

const DEFAULT_MOBILE_PANE_LABELS: MobilePaneLabels = {
  left: "Files",
  right: "Content",
};

/**
 * A draggable sidebar whose width is remembered per device.
 *
 * Separate from `ResizablePanelLayout` because that one owns collapse
 * behaviour, a toggle button and a mobile stacked layout, none of which a file
 * tree needs. Both share their persistence through `usePersistentPanelSize`.
 */
export function ResizableSidebar({
  sidebar,
  children,
  storageKey,
  defaultWidth = "256px",
  minSidebarWidthPx = 160,
  minContentWidthPx = 320,
  mobilePaneLabels = DEFAULT_MOBILE_PANE_LABELS,
  side = "left",
  showContentSignal,
}: ResizableSidebarProps) {
  "use no memo";
  const { savedSize, onLayoutChanged } = usePersistentPanelSize({
    storageKey,
    panel: "left",
    defaultSize: defaultWidth,
  });
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [showSidebar, setShowSidebar] = useState(true);

  const [prevContentSignal, setPrevContentSignal] = useState(showContentSignal);
  if (showContentSignal !== prevContentSignal) {
    setPrevContentSignal(showContentSignal);
    if (isMobile && showContentSignal !== undefined) setShowSidebar(false);
  }

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <MobilePaneSwitcher
          labels={mobilePaneLabels}
          showingRight={!showSidebar}
          onSelect={(pane) => setShowSidebar(pane === "left")}
        />
        <div
          className={showSidebar ? "flex min-h-0 flex-1 flex-col" : "hidden"}
        >
          {sidebar}
        </div>
        <div
          className={showSidebar ? "hidden" : "flex min-h-0 flex-1 flex-col"}
        >
          {children}
        </div>
      </div>
    );
  }

  const sidebarPanel = (
    <Panel
      id={LEFT_PANEL_ID}
      defaultSize={savedSize}
      minSize={minSidebarWidthPx}
      className="flex min-h-0 flex-col"
    >
      {sidebar}
    </Panel>
  );
  const contentPanel = (
    <Panel
      id={RIGHT_PANEL_ID}
      minSize={minContentWidthPx}
      className="flex min-h-0 flex-col"
    >
      {children}
    </Panel>
  );
  const separator = (
    <Separator className="w-px shrink-0 bg-border transition-colors hover:bg-primary/50 data-resize-handle-active:bg-primary data-resize-handle-active:transition-none" />
  );

  return (
    <Group
      key={side}
      orientation="horizontal"
      className="h-full min-h-0"
      onLayoutChanged={onLayoutChanged}
    >
      {side === "right" ? (
        <>
          {contentPanel}
          {separator}
          {sidebarPanel}
        </>
      ) : (
        <>
          {sidebarPanel}
          {separator}
          {contentPanel}
        </>
      )}
    </Group>
  );
}
