"use client";

import { useEffect, useRef, useState } from "react";
import type { Layout, PanelSize } from "react-resizable-panels";
import { useLocalStorage } from "usehooks-ts";

/**
 * Panel ids for a two-panel `Group`. A group's `Layout` is keyed by panel id, so
 * the ids have to be stable across mounts — the library's `useId` fallback is
 * not, which would make a saved layout unreadable next mount.
 */
export const LEFT_PANEL_ID = "left";
export const RIGHT_PANEL_ID = "right";
export const TOP_PANEL_ID = "top";
export const BOTTOM_PANEL_ID = "bottom";

type PanelPlacement = "left" | "right" | "top" | "bottom";

interface PersistentPanelSizeOptions {
  /** localStorage namespace. The size is stored under `${storageKey}:size`. */
  storageKey: string;
  /** Which of the two panels the stored size describes. */
  panel: PanelPlacement;
  /** Size used until the user drags, e.g. `"60%"` or `"256px"`. */
  defaultSize: string;
}

interface PersistentPanelSize {
  /**
   * Pass to the persisted panel's `defaultSize`. Frozen at mount, since the
   * group only reads it once and changing it later would fight the live layout.
   */
  initialSize: string;
  /**
   * The latest stored size, for callers that resize imperatively — expanding a
   * collapsed panel back to the width the user chose, for instance.
   */
  savedSize: string;
  /** Pass to the `Group`'s `onLayoutChanged`. */
  onLayoutChanged: (layout: Layout) => void;
}

/**
 * Remembers where the user dragged a two-panel `Group`'s handle.
 *
 * localStorage rather than Convex: the split that feels right depends on the
 * window in front of you, so syncing it between devices would be wrong, and a
 * drag should not cost a server write.
 *
 * Reads the group's `onLayoutChanged` rather than a panel's `onResize` because
 * the latter fires on every pointer move, which would be a write per frame of
 * the drag. This one fires once, after the pointer is released.
 */
export function usePersistentPanelSize({
  storageKey,
  panel,
  defaultSize,
}: PersistentPanelSizeOptions): PersistentPanelSize {
  const [storedSize, setSavedSize] = useLocalStorage(
    `${storageKey}:size`,
    defaultSize,
  );
  const savedSize = usableStoredSize(storedSize, defaultSize);
  const [initialSize] = useState(savedSize);
  // Guards the first layout report; see `onLayoutChanged` below.
  const isMounted = useRef(false);
  useEffect(() => {
    isMounted.current = true;
  }, []);

  const onLayoutChanged = (layout: Layout) => {
    // The group reports its starting layout from a layout effect, and effects
    // run child-first — so it fires before this component's own effects, while
    // `useLocalStorage`'s setter is still a stub that throws. Nothing is lost by
    // skipping it: that first report only echoes back `initialSize`.
    if (!isMounted.current) return;
    const percentage = panelPercentage(layout, panel);
    // Null when a panel is missing; 0 when collapsed — collapsed state is
    // tracked separately, and 0 is not a width worth returning to.
    if (percentage === null || percentage === 0) return;
    setSavedSize(`${percentage}%`);
  };

  return { initialSize, savedSize, onLayoutChanged };
}

/**
 * True when a panel's reported size describes a laid-out panel.
 *
 * A panel inside a `display: none` subtree — how the sessions layout keeps the
 * last few session shells mounted — measures 0px inside a 0px group, and the
 * library derives the percentage as `panelWidth / groupWidth`, so the report
 * arrives as `NaN`. That is not a layout change and must not be mistaken for
 * one: `NaN === 0` is false, so a collapsed panel that gets hidden would
 * otherwise read back as expanded, and `${NaN}%` would be stored as the width
 * to re-expand to.
 */
export function isMeasuredPanelSize(size: PanelSize): boolean {
  return Number.isFinite(size.asPercentage);
}

/**
 * Whether a measured panel is in its collapsed snap.
 *
 * `collapsedSizePx === 0` is the list/detail case: collapse is 0% of the group.
 * Sandbox layouts snap to the icon-rail width instead, so percentage is a few
 * percent rather than 0 and pixel size is the signal.
 *
 * `minSizePx` covers the band between the rail and `minSize`. The library stores
 * collapse as a percentage, so a sidebar/window resize can grow a 44px rail to
 * 80px without reaching the expanded minimum — that is still collapsed, not a
 * split worth restoring.
 */
export function isCollapsedPanelSize(
  size: PanelSize,
  collapsedSizePx: number,
  minSizePx = 0,
): boolean {
  if (collapsedSizePx <= 0) return size.asPercentage === 0;
  if (size.inPixels <= collapsedSizePx + 1) return true;
  return minSizePx > collapsedSizePx && size.inPixels < minSizePx;
}

/**
 * A stored size, or the default when the stored string has no finite number in
 * it. Recovers panels whose stored width was written as `NaN%` before hidden
 * panels were filtered out; without this the group applies a `NaN` size on every
 * load and a reload cannot clear it.
 */
export function usableStoredSize(size: string, defaultSize: string): string {
  return Number.isFinite(parseFloat(size)) ? size : defaultSize;
}

/**
 * The width to restore when expanding a rail panel.
 *
 * A group resize used to persist the inflated-rail percentage as if it were a
 * real split. Feeding that to `resize()` looks like a no-op — the panel stays
 * a strip, and the only way out is dragging. Fall back to the layout default
 * when the stored width would land below `minSizePx`.
 */
export function usableExpandedPanelSize(
  size: string,
  defaultSize: string,
  minSizePx: number,
  groupWidthPx: number,
): string {
  const usable = usableStoredSize(size, defaultSize);
  if (minSizePx <= 0 || groupWidthPx <= 0) return usable;
  if (!usable.endsWith("%")) return usable;
  const percentage = Number(usable.slice(0, -1));
  if (!Number.isFinite(percentage)) return defaultSize;
  const pixels = (percentage / 100) * groupWidthPx;
  return pixels + 1 < minSizePx ? defaultSize : usable;
}

/**
 * A panel's share of its group, as a percentage. Derived from the ratio between
 * the two flexGrow values rather than read straight off one of them, so it holds
 * whatever scale the library normalises them to.
 */
export function panelPercentage(
  layout: Layout,
  panel: PanelPlacement,
): number | null {
  const primaryId =
    panel === "left" || panel === "right" ? LEFT_PANEL_ID : TOP_PANEL_ID;
  const secondaryId =
    panel === "left" || panel === "right" ? RIGHT_PANEL_ID : BOTTOM_PANEL_ID;
  const primary = layout[primaryId];
  const secondary = layout[secondaryId];
  if (primary === undefined || secondary === undefined) return null;
  if (!Number.isFinite(primary) || !Number.isFinite(secondary)) return null;
  const total = primary + secondary;
  if (total <= 0) return null;
  const selected = panel === "left" || panel === "top" ? primary : secondary;
  return (selected / total) * 100;
}

/**
 * The other panel's share when both `defaultSize`s must add to 100%. Passing
 * two independent defaults (e.g. left `33%` and a saved right `75%`) makes the
 * group ignore the stored width on reload.
 */
export function complementaryPercentage(
  size: string,
  fallback: string,
): string {
  if (!size.endsWith("%")) return fallback;
  const percentage = Number(size.slice(0, -1));
  if (!Number.isFinite(percentage)) return fallback;
  return `${100 - percentage}%`;
}
