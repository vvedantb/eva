"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocalStorage } from "usehooks-ts";
import {
  Group,
  Panel,
  type PanelSize,
  Separator,
  usePanelRef,
} from "react-resizable-panels";
import { IconGripHorizontal } from "@tabler/icons-react";
import type { SandboxOwner } from "@eva/backend";
import { useShortcut } from "@/lib/hotkeys/useShortcut";
import {
  BOTTOM_PANEL_ID,
  TOP_PANEL_ID,
  complementaryPercentage,
  isMeasuredPanelSize,
  usePersistentPanelSize,
} from "@/lib/hooks/usePersistentPanelSize";
import {
  useSandboxPanes,
  type SandboxPanesApi,
  type SharedTerminalPane,
} from "./useSandboxPanes";
import { SandboxTerminalPanel } from "./SandboxTerminalPanel";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

/**
 * Imperative surface for the bottom terminal panel, shared by the Mod+J
 * shortcut, the tab-bar toggle button, and the action palette.
 */
export interface TerminalPanelApi {
  expanded: boolean;
  /** Expands (creating the first terminal when none exist) or collapses. */
  toggle: () => void;
  /** Creates a terminal pane and reveals the panel. */
  newTerminal: () => void;
  newTerminalDisabled: boolean;
}

interface SandboxWorkspaceProps {
  /** Keys the panes, preview and PTYs (a quick task's is its session). */
  owner: SandboxOwner;
  storageScope: string;
  sandboxId: string | undefined;
  isActive: boolean;
  terminalPanes: SharedTerminalPane[] | undefined;
  hotkeyEnabled?: boolean;
  children: (
    panes: SandboxPanesApi,
    owner: SandboxOwner,
    terminalPanel: TerminalPanelApi,
  ) => ReactNode;
}

const DEFAULT_BOTTOM_SIZE = "35%";
const DEFAULT_TOP_SIZE = "65%";

/** Adds the shared terminal bottom panel around a sandbox's two-column shell. */
export function SandboxWorkspace({
  owner,
  storageScope,
  sandboxId,
  isActive,
  terminalPanes,
  hotkeyEnabled = true,
  children,
}: SandboxWorkspaceProps) {
  const simpleView = useSimpleView();
  const panes = useSandboxPanes({
    owner,
    storageScope,
    isActive,
    terminalPanes,
  });
  const [expanded, setExpanded] = useLocalStorage(
    `eva:${storageScope}:terminal-panel-open`,
    false,
  );
  const bottomPanelRef = usePanelRef();
  const {
    initialSize: initialBottomSize,
    savedSize: savedBottomSize,
    onLayoutChanged,
  } = usePersistentPanelSize({
    storageKey: `eva:${storageScope}:terminal-panel`,
    panel: "bottom",
    defaultSize: DEFAULT_BOTTOM_SIZE,
  });
  const [initialExpanded] = useState(expanded);
  const collapsedRef = useRef(!expanded);

  const setPanelExpanded = (next: boolean) => {
    setExpanded(next);
  };

  // Imperative resize/collapse runs after the state commit rather than inside
  // setPanelExpanded: its closure flows through the children() render call
  // (terminalPanel), and a ref read reachable from render bails the whole file
  // out of React Compiler memoization. The collapsedRef guard skips the sync
  // when the change originated from a drag (handleResize already saw it), so
  // no resize fires mid-drag. This also covers `expanded` flips from other
  // tabs via the shared localStorage key.
  useEffect(() => {
    if (collapsedRef.current === !expanded) return;
    collapsedRef.current = !expanded;
    if (expanded) {
      bottomPanelRef.current?.resize(savedBottomSize);
      return;
    }
    bottomPanelRef.current?.collapse();
  }, [expanded, savedBottomSize, bottomPanelRef]);

  const handleResize = (size: PanelSize) => {
    // A hidden panel reports NaN, not a collapse — see `isMeasuredPanelSize`.
    // Reading it as expanded flipped the stored open flag on every session
    // switch, leaving the Mod+J toggle a click behind the real panel.
    if (!isMeasuredPanelSize(size)) return;
    const collapsed = size.asPercentage === 0;
    if (collapsedRef.current === collapsed) return;
    collapsedRef.current = collapsed;
    setExpanded(!collapsed);
  };

  const terminalPanel: TerminalPanelApi = {
    expanded,
    toggle: () => {
      if (expanded) {
        setPanelExpanded(false);
        return;
      }
      setPanelExpanded(true);
      if (panes.userTermPanes.length > 0) return;
      if (panes.newTerminalDisabled) return;
      void panes.handleNewTerminal();
    },
    newTerminal: () => {
      setPanelExpanded(true);
      void panes.handleNewTerminal();
    },
    newTerminalDisabled: panes.newTerminalDisabled,
  };

  useShortcut(
    "togglePreviewConsole",
    (event) => {
      event.preventDefault();
      terminalPanel.toggle();
    },
    { enabled: hotkeyEnabled && !simpleView },
  );

  const bottomDefaultSize = initialExpanded ? initialBottomSize : "0%";
  const topDefaultSize = initialExpanded
    ? complementaryPercentage(initialBottomSize, DEFAULT_TOP_SIZE)
    : "100%";

  if (simpleView) {
    return <>{children(panes, owner, terminalPanel)}</>;
  }

  return (
    <Group
      id={`eva:${storageScope}:terminal-panel`}
      orientation="vertical"
      className="h-full"
      onLayoutChanged={onLayoutChanged}
    >
      <Panel id={TOP_PANEL_ID} defaultSize={topDefaultSize} minSize={240}>
        {children(panes, owner, terminalPanel)}
      </Panel>
      <Separator
        className={`relative h-px bg-border transition-colors hover:bg-primary/50 data-resize-handle-active:bg-primary data-resize-handle-active:transition-none ${expanded ? "" : "hidden"}`}
      >
        <div className="absolute inset-x-0 -top-1.5 z-10 flex h-3 items-center justify-center">
          <IconGripHorizontal className="size-4 text-muted-foreground/50" />
        </div>
      </Separator>
      <Panel
        id={BOTTOM_PANEL_ID}
        collapsible
        collapsedSize={0}
        defaultSize={bottomDefaultSize}
        minSize={160}
        maxSize="70%"
        panelRef={bottomPanelRef}
        onResize={handleResize}
      >
        <SandboxTerminalPanel
          owner={owner}
          sandboxId={sandboxId}
          isActive={isActive}
          expanded={expanded}
          panes={panes}
          onClose={() => setPanelExpanded(false)}
        />
      </Panel>
    </Group>
  );
}
