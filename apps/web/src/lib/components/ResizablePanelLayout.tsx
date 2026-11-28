"use client";

import { cn } from "@eva/ui";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useShortcut } from "@/lib/hotkeys/useShortcut";
import {
  Group,
  Panel,
  type Layout,
  type PanelSize,
  Separator,
  usePanelRef,
} from "react-resizable-panels";
import { IconGripVertical } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import { useLocalStorage } from "usehooks-ts";
import {
  MobilePaneSwitcher,
  type MobilePaneLabels,
} from "@/lib/components/MobilePaneSwitcher";
import {
  LEFT_PANEL_ID,
  RIGHT_PANEL_ID,
  complementaryPercentage,
  isCollapsedPanelSize,
  isMeasuredPanelSize,
  panelPercentage,
  usableExpandedPanelSize,
  usePersistentPanelSize,
} from "@/lib/hooks/usePersistentPanelSize";
import { useEmbedChatOnly } from "@/lib/embed/embedded";
import {
  motionEase,
  popOutSidePanel,
  slideNextResize,
  useMediaQuery,
} from "@vvedantb/ui";

interface PanelContext {
  rightPanelCollapsed: boolean;
  onToggleRightPanel: () => void;
}

interface ResizablePanelLayoutProps {
  leftPanel: (ctx: PanelContext) => ReactNode;
  rightPanel: (ctx: PanelContext) => ReactNode;
  leftDefaultSize: string;
  leftMinWidthPx: number;
  rightMinWidthPx: number;
  storageKey: string;
  collapsedStorageKey?: string;
  defaultRightCollapsed?: boolean;
  rightCollapsedSizePx?: number;
  seamlessSeparator?: boolean;
  expandRightSignal?: number;
  collapseRightSignal?: number;
  mobilePaneLabels?: MobilePaneLabels;
  hotkeyEnabled?: boolean;
  chatPane?: "left" | "right";
}

const DEFAULT_RIGHT_PANEL_SIZE = "60%";
const DEFAULT_MOBILE_PANE_LABELS: MobilePaneLabels = {
  left: "List",
  right: "Details",
};

export function ResizablePanelLayout({
  leftPanel,
  rightPanel,
  leftDefaultSize,
  leftMinWidthPx,
  rightMinWidthPx,
  storageKey,
  collapsedStorageKey = storageKey,
  defaultRightCollapsed = true,
  rightCollapsedSizePx = 0,
  seamlessSeparator = false,
  expandRightSignal,
  collapseRightSignal,
  mobilePaneLabels = DEFAULT_MOBILE_PANE_LABELS,
  hotkeyEnabled = true,
  chatPane,
}: ResizablePanelLayoutProps) {
  "use no memo";
  const chatOnly = useEmbedChatOnly();
  const rightPanelRef = usePanelRef();
  const rightPanelElementRef = useRef<HTMLDivElement>(null);
  const groupElementRef = useRef<HTMLDivElement>(null);
  const [savedCollapsed, setSavedCollapsed] = useLocalStorage(
    collapsedStorageKey,
    defaultRightCollapsed,
  );
  const defaultRightSize = complementaryPercentage(
    leftDefaultSize,
    DEFAULT_RIGHT_PANEL_SIZE,
  );
  const {
    initialSize: initialRightSize,
    savedSize: savedRightSize,
    onLayoutChanged,
  } = usePersistentPanelSize({
    storageKey,
    panel: "right",
    defaultSize: defaultRightSize,
  });
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [mobileShowsRight, setMobileShowsRight] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(savedCollapsed);
  const rightCollapsed = isMobile ? !mobileShowsRight : desktopCollapsed;
  const lastExpandedSize = useRef<string>(savedRightSize);
  const groupWidthPxRef = useRef(0);
  const [initialCollapsed] = useState(savedCollapsed);
  const rightDefaultSize = initialCollapsed
    ? rightCollapsedSizePx > 0
      ? `${rightCollapsedSizePx}px`
      : "0%"
    : initialRightSize;
  const restoredLeftSize = initialCollapsed
    ? "100%"
    : complementaryPercentage(initialRightSize, leftDefaultSize);

  const [prevCollapseSignal, setPrevCollapseSignal] =
    useState(collapseRightSignal);
  if (collapseRightSignal !== prevCollapseSignal) {
    setPrevCollapseSignal(collapseRightSignal);
    if (isMobile && collapseRightSignal !== undefined) {
      setMobileShowsRight(false);
    }
  }

  const railMinSizePx = rightCollapsedSizePx > 0 ? rightMinWidthPx : 0;

  const handleToggle = useCallback(() => {
    if (isMobile) {
      setMobileShowsRight((prev) => !prev);
      return;
    }
    const panel = rightPanelRef.current;
    if (!panel) return;
    const size = panel.getSize();
    const collapsed = isMeasuredPanelSize(size)
      ? isCollapsedPanelSize(size, rightCollapsedSizePx, railMinSizePx)
      : desktopCollapsed;
    if (collapsed) {
      slideNextResize(groupElementRef.current, "open");
      panel.resize(
        usableExpandedPanelSize(
          lastExpandedSize.current,
          defaultRightSize,
          railMinSizePx,
          groupWidthPxRef.current,
        ),
      );
      return;
    }
    popOutSidePanel(rightPanelElementRef.current, () => {
      slideNextResize(groupElementRef.current, "close");
      panel.collapse();
    });
  }, [
    defaultRightSize,
    isMobile,
    railMinSizePx,
    desktopCollapsed,
    rightCollapsedSizePx,
    rightPanelRef,
  ]);

  useShortcut(
    "toggleSandboxPanel",
    (e) => {
      e.preventDefault();
      handleToggle();
    },
    { enabled: hotkeyEnabled },
  );

  /* eslint-disable no-effect/no-event-handler, no-effect/no-adjust-state-on-prop-change --
     `expandRightSignal` is a bumped counter from elsewhere in the tree, and the
     response is an imperative `panel.resize()` on the layout library. */
  useEffect(() => {
    if (expandRightSignal === undefined || expandRightSignal === 0) return;
    if (isMobile) {
      setMobileShowsRight(true);
      return;
    }
    slideNextResize(groupElementRef.current, "open");
    rightPanelRef.current?.resize(
      usableExpandedPanelSize(
        lastExpandedSize.current,
        defaultRightSize,
        railMinSizePx,
        groupWidthPxRef.current,
      ),
    );
  }, [
    defaultRightSize,
    expandRightSignal,
    isMobile,
    railMinSizePx,
    rightPanelRef,
  ]);
  /* eslint-enable no-effect/no-event-handler, no-effect/no-adjust-state-on-prop-change */

  /* eslint-disable no-effect/no-event-handler --
     Re-applies a pixel snap on the layout library's panel handle, which only
     reports its size after it has laid out. */
  useEffect(() => {
    if (isMobile || rightCollapsedSizePx <= 0) return;
    const panel = rightPanelRef.current;
    if (!panel) return;
    const size = panel.getSize();
    if (!isMeasuredPanelSize(size)) return;
    if (!isCollapsedPanelSize(size, rightCollapsedSizePx, railMinSizePx))
      return;
    panel.resize(`${rightCollapsedSizePx}px`);
  }, [isMobile, railMinSizePx, rightCollapsedSizePx, rightPanelRef]);
  /* eslint-enable no-effect/no-event-handler */

  const handleResize = (size: PanelSize) => {
    if (!isMeasuredPanelSize(size)) return;
    if (size.asPercentage > 0) {
      groupWidthPxRef.current = size.inPixels / (size.asPercentage / 100);
    }
    const collapsed = isCollapsedPanelSize(
      size,
      rightCollapsedSizePx,
      railMinSizePx,
    );
    if (!collapsed) {
      lastExpandedSize.current = `${size.asPercentage}%`;
    }
    setDesktopCollapsed(collapsed);
    setSavedCollapsed(collapsed);
  };

  const handleLayoutChanged = (layout: Layout) => {
    if (railMinSizePx > 0 && groupWidthPxRef.current > 0) {
      const pct = panelPercentage(layout, "right");
      if (pct !== null) {
        const rightPx = (pct / 100) * groupWidthPxRef.current;
        if (rightPx < railMinSizePx) return;
      }
    }
    onLayoutChanged(layout);
  };

  const ctx: PanelContext = {
    rightPanelCollapsed: rightCollapsed,
    onToggleRightPanel: handleToggle,
  };

  if (chatOnly && chatPane) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {chatPane === "left" ? leftPanel(ctx) : rightPanel(ctx)}
      </div>
    );
  }

  if (isMobile) {
    const panelTransition = { duration: 0.22, ease: motionEase };
    const panelEnter = { opacity: 0, y: "8%" };
    const panelRest = { opacity: 1, y: "0%" };
    const panelExit = { opacity: 0, y: "8%" };

    return (
      <div className="flex h-full max-sm:min-h-0 flex-col">
        <MobilePaneSwitcher
          labels={mobilePaneLabels}
          showingRight={!rightCollapsed}
          onSelect={(pane) => {
            if (pane === "left" ? !rightCollapsed : rightCollapsed) {
              handleToggle();
            }
          }}
        />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            className={
              rightCollapsed ? "flex min-h-0 flex-1 flex-col" : "hidden"
            }
          >
            {leftPanel(ctx)}
          </div>
          <AnimatePresence initial={false}>
            {!rightCollapsed ? (
              <m.div
                key="mobile-right-panel"
                className="absolute inset-0 z-10 flex min-h-0 flex-col bg-background"
                initial={panelEnter}
                animate={panelRest}
                exit={panelExit}
                transition={panelTransition}
              >
                {rightPanel(ctx)}
              </m.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  const hideSeparator = rightCollapsed && rightCollapsedSizePx === 0;

  return (
    <Group
      orientation="horizontal"
      className="h-full"
      elementRef={groupElementRef}
      onLayoutChanged={handleLayoutChanged}
    >
      <Panel
        id={LEFT_PANEL_ID}
        defaultSize={restoredLeftSize}
        minSize={leftMinWidthPx}
      >
        {leftPanel(ctx)}
      </Panel>
      <Separator
        className={cn(
          "group/separator w-px transition-colors hover:bg-primary/50 data-resize-handle-active:bg-primary data-resize-handle-active:transition-none",
          seamlessSeparator ? "bg-transparent" : "bg-border",
          hideSeparator && "hidden",
        )}
      >
        <div className="flex items-center justify-center w-3 h-full -mx-1.5 relative z-10">
          <IconGripVertical
            className={cn(
              "w-4 h-4 text-muted-foreground/50",
              seamlessSeparator &&
                "opacity-0 transition-opacity group-hover/separator:opacity-100 group-data-resize-handle-active/separator:opacity-100",
            )}
          />
        </div>
      </Separator>
      <Panel
        id={RIGHT_PANEL_ID}
        collapsible
        collapsedSize={rightCollapsedSizePx}
        defaultSize={rightDefaultSize}
        minSize={rightMinWidthPx}
        groupResizeBehavior={
          rightCollapsedSizePx > 0 ? "preserve-pixel-size" : undefined
        }
        panelRef={rightPanelRef}
        elementRef={rightPanelElementRef}
        onResize={handleResize}
      >
        {rightPanel(ctx)}
      </Panel>
    </Group>
  );
}
