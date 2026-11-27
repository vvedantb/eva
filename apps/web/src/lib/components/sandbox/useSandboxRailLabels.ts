"use client";

import { useLocalStorage } from "usehooks-ts";
import {
  SIDE_PANEL_RAIL_LABELLED_WIDTH_PX,
  SIDE_PANEL_RAIL_WIDTH_PX,
} from "@vvedantb/ui";

/** One preference for every sandbox rail in the app, hence a fixed key. */
const STORAGE_KEY = "eva:sandbox-rail:labels";

interface SandboxRailLabels {
  showLabels: boolean;
  setShowLabels: (showLabels: boolean) => void;
}

/**
 * Whether the desktop rail spells its tabs out under the icons.
 *
 * Off by default — the rail is 44px of chrome next to the pane that matters —
 * but eight to twelve unlabelled icons is a lot to learn from tooltips alone,
 * so it is one toggle away (rail button, or ⌘⇧P). localStorage rather than
 * Convex: this is per-screen, like the panel split next to it.
 */
export function useSandboxRailLabels(): SandboxRailLabels {
  const [showLabels, setShowLabels] = useLocalStorage<boolean>(
    STORAGE_KEY,
    false,
  );
  return { showLabels, setShowLabels };
}

/**
 * Width the sandbox panel collapses to, for the current label preference.
 * `useLocalStorage` keeps every instance in step, so the rail and the panel
 * that snaps around it cannot disagree.
 */
export function useSandboxRailWidthPx(): number {
  const { showLabels } = useSandboxRailLabels();
  return showLabels
    ? SIDE_PANEL_RAIL_LABELLED_WIDTH_PX
    : SIDE_PANEL_RAIL_WIDTH_PX;
}
