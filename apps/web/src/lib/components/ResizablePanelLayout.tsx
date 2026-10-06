"use client";

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
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
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
  /** Initial collapsed state of the right panel when there is no stored value. Defaults to true. */
  defaultRightCollapsed?: boolean;
  /**
   * Pixel width the right panel snaps to when collapsed. `0` hides it (list /
   * detail). Sandbox layouts pass the icon-rail width so the rail stays visible.
   */
  rightCollapsedSizePx?: number;
  /**
   * Bump this value to force-expand the right panel (e.g. agent browser lock).
   * Only expands; never collapses.
   */
  expandRightSignal?: number;
  /**
   * Bump this value to send a phone back to the left pane (e.g. the selection
   * the right pane was showing has been cleared). Mobile only: on desktop both
   * panes are on screen, so an empty right pane is a normal state rather than a
   * dead end, and collapsing it would fight the user's dragged width.
   */
  collapseRightSignal?: number;
  /**
   * Labels for the below-`md` pane switcher. Defaults are generic because the
   * switcher is the only way back to the left pane on a phone — call sites that
   * can name their panes ("Chat"/"Sandbox") should.
   */
  mobilePaneLabels?: MobilePaneLabels;
  /**
   * False for a layout that is mounted but not on screen. The collapse hotkey is
   * a global listener, so every kept-alive session shell would otherwise toggle
   * on one keypress — and a hidden group measures 0px, so its resize resolves to
   * `NaN` and leaves that session's panel broken until remount.
   */
  hotkeyEnabled?: boolean;
}

const DEFAULT_RIGHT_PANEL_SIZE = "60%";
const MOBILE_PANEL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
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
  defaultRightCollapsed = true,
  rightCollapsedSizePx = 0,
  expandRightSignal,
  collapseRightSignal,
  mobilePaneLabels = DEFAULT_MOBILE_PANE_LABELS,
  hotkeyEnabled = true,
}: ResizablePanelLayoutProps) {
  "use no memo";
  const rightPanelRef = usePanelRef();
  const [savedCollapsed, setSavedCollapsed] = useLocalStorage(
    storageKey,
    defaultRightCollapsed,
  );
  const defaultRightSize = complementaryPercentage(
    leftDefaultSize,
    DEFAULT_RIGHT_PANEL_SIZE,
  );
  // Where the user last dragged the handle.
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
  // Below `md` only one pane is on screen, so the layout always opens on the
  // left pane (chat / list) regardless of `defaultRightCollapsed` or the stored
  // desktop preference. The switcher is the way back; opening on the right
  // would trap the user.
  const [rightCollapsed, setRightCollapsed] = useState(() =>
    isMobile ? true : savedCollapsed,
  );
  // Seeded from storage so expanding after a reload returns to the dragged
  // width instead of the layout default.
  const lastExpandedSize = useRef<string>(savedRightSize);
  // Last measured group width, used to ignore a rail-width snap as a persist.
  const groupWidthPxRef = useRef(0);
  // Captured once for defaultSize — the stored flag does not change after mount
  const [initialCollapsed] = useState(savedCollapsed);
  const rightDefaultSize = initialCollapsed
    ? rightCollapsedSizePx > 0
      ? `${rightCollapsedSizePx}px`
      : "0%"
    : initialRightSize;
  const restoredLeftSize = initialCollapsed
    ? "100%"
    : complementaryPercentage(initialRightSize, leftDefaultSize);

  // Adjust-state-during-render rather than an effect: the only work is setting
  // React state, and it is mobile-only, so there is nothing imperative to do to
  // the Panel ref on the desktop path.
  const [prevCollapseSignal, setPrevCollapseSignal] =
    useState(collapseRightSignal);
  if (collapseRightSignal !== prevCollapseSignal) {
    setPrevCollapseSignal(collapseRightSignal);
    if (isMobile && collapseRightSignal !== undefined) setRightCollapsed(true);
  }

  const railMinSizePx = rightCollapsedSizePx > 0 ? rightMinWidthPx : 0;

  const handleToggle = useCallback(() => {
    // Mobile layout has no Panel ref — toggle local state directly. It is not
    // persisted: which pane you were last looking at on a phone must not
    // overwrite the dragged/collapsed desktop preference under the same key.
    if (isMobile) {
      setRightCollapsed((prev) => !prev);
      return;
    }
    const panel = rightPanelRef.current;
    if (!panel) return;
    // Read the live size rather than `rightCollapsed`. A group resize can
    // inflate a collapsed rail past `collapsedSizePx` without reaching minSize,
    // which used to flip that flag to "expanded" so this called `collapse()`
    // on an already-collapsed panel (a no-op — drag was the only way back).
    const size = panel.getSize();
    const collapsed = isMeasuredPanelSize(size)
      ? isCollapsedPanelSize(size, rightCollapsedSizePx, railMinSizePx)
      : rightCollapsed;
    if (collapsed) {
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
    panel.collapse();
  }, [
    defaultRightSize,
    isMobile,
    railMinSizePx,
    rightCollapsed,
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
      setRightCollapsed(false);
      return;
    }
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
  // The rail can change width while it is on screen (the sandbox rail's label
  // preference). `Panel` re-registers with the new `collapsedSize`, but a panel
  // already snapped to the old pixel width is left sitting at it, so re-apply
  // the snap here. Idempotent: resizing to the width it already has is a no-op.
  useEffect(() => {
    if (isMobile || rightCollapsedSizePx <= 0) return;
    const panel = rightPanelRef.current;
    if (!panel) return;
    const size = panel.getSize();
    if (!isMeasuredPanelSize(size)) return;
    // Only the collapsed snap is ours to move — an expanded pane is the width
    // the user dragged it to.
    if (!isCollapsedPanelSize(size, rightCollapsedSizePx, railMinSizePx))
      return;
    panel.resize(`${rightCollapsedSizePx}px`);
  }, [isMobile, railMinSizePx, rightCollapsedSizePx, rightPanelRef]);
  /* eslint-enable no-effect/no-event-handler */

  const handleResize = (size: PanelSize) => {
    // Hiding the panel (a kept-alive session shell going `display: none`) is not
    // a collapse — see `isMeasuredPanelSize`. Taking that report as "expanded"
    // left this state disagreeing with the panel, so the toggle called
    // `collapse()` on an already-collapsed panel and looked dead until reload.
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
    setRightCollapsed(collapsed);
    setSavedCollapsed(collapsed);
  };

  const handleLayoutChanged = (layout: Layout) => {
    // A rail-width snap — or the in-between strip a group resize can leave — is
    // not a dragged width. Persisting it would make the next expand restore to
    // tens of pixels instead of the last real split.
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

  if (isMobile) {
    const panelTransition = { duration: 0.22, ease: MOBILE_PANEL_EASE };
    const panelEnter = { opacity: 0, y: "8%" };
    const panelRest = { opacity: 1, y: "0%" };
    const panelExit = { opacity: 0, y: "8%" };

    // One pane at a time: the visible pane owns the full height. The switcher
    // is the way back — the desktop collapse control lives on the sandbox rail,
    // which is not on screen while the right pane is showing.
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
        {/* The right pane is an absolute overlay rather than a flex sibling so
            that its exit animation cannot momentarily split the height with the
            reappearing left pane. */}
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
    // No `id`: the library keeps one global registry of mounted groups and
    // resolves every lookup — imperative resize/collapse, the rendered
    // flexGrow, the layout-change listener — to the *first* group with that id.
    // Passing `storageKey` gave all three kept-alive session shells the id
    // `sandbox-collapsed`, so the visible session drove the oldest hidden one:
    // its 0px group turned a 44px collapse into 0% and the rail vanished, and
    // expanding back was a no-op. The library's `useId` fallback is unique per
    // instance, which is what a group id is for; only the *panel* ids have to
    // be stable, and those stay explicit.
    <Group
      orientation="horizontal"
      className="h-full"
      onLayoutChanged={handleLayoutChanged}
    >
      <Panel
        id={LEFT_PANEL_ID}
        defaultSize={restoredLeftSize}
        minSize={leftMinWidthPx}
      >
        {leftPanel(ctx)}
      </Panel>
      {/* z-10 so the grip sits above adjacent pane content. The sandbox rail
          uses z-20 so a collapsed-rail click hits the toggle instead of
          starting a drag. */}
      <Separator
        className={`w-px bg-border transition-colors hover:bg-primary/50 data-resize-handle-active:bg-primary data-resize-handle-active:transition-none ${hideSeparator ? "hidden" : ""}`}
      >
        <div className="flex items-center justify-center w-3 h-full -mx-1.5 relative z-10">
          <IconGripVertical className="w-4 h-4 text-muted-foreground/50" />
        </div>
      </Separator>
      <Panel
        id={RIGHT_PANEL_ID}
        collapsible
        collapsedSize={rightCollapsedSizePx}
        defaultSize={rightDefaultSize}
        minSize={rightMinWidthPx}
        // Keep the rail at 44px (and an expanded sandbox at its dragged pixels)
        // when the group width changes. The default relative behaviour turns a
        // collapsed percentage into a wider strip, which is what made the
        // toggle disagree with the panel.
        groupResizeBehavior={
          rightCollapsedSizePx > 0 ? "preserve-pixel-size" : undefined
        }
        panelRef={rightPanelRef}
        onResize={handleResize}
      >
        {rightPanel(ctx)}
      </Panel>
    </Group>
  );
}
