"use client";

import { useSyncExternalStore } from "react";
import { cn, useWebPreview } from "@eva/ui";
import {
  armPreviewMiniPlayer,
  disarmPreviewMiniPlayer,
  dropPreviewMiniPlayerForSandbox,
  notePreviewAnchorAttached,
  notePreviewAnchorDetached,
  type PreviewAnchorRole,
  type PreviewMiniPlayerSource,
} from "./previewMiniPlayerStore";
import {
  previewContainedLayout,
  resolveMiniPlayerLogicalSize,
} from "./previewContain";

/**
 * Global preview-iframe keep-alive.
 *
 * Preview iframes are the one thing React unmounting destroys irrecoverably:
 * detaching an iframe from the DOM discards its document, so any remount
 * reloads the app under development. Route changes (/home, cross-app cold
 * switches) unmount the session tree no matter how it is cached, so the
 * iframes live OUTSIDE the router instead — in {@link PreviewIframeHost},
 * mounted once at the app root. Panels render a measured placeholder
 * ({@link PersistentPreviewBody}); the host overlays the real iframe on the
 * placeholder's rect. The iframe element never moves in the DOM (moving also
 * reloads it) — it only repositions, and hides via `display: none` (which
 * keeps the document alive) while its placeholder is hidden or unmounted.
 */

interface PreviewInfo {
  url: string;
  port: number;
}

/**
 * Per sandbox:port resolution state, kept so a remounting useSandboxPreview
 * can seed itself and skip the loading overlay + iframe remount entirely.
 */
export interface PreviewMeta {
  previewInfo: PreviewInfo;
  strippedTarget: string;
  epoch: number;
}

/** Viewport-relative box the host paints a hosted iframe into. */
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface LogicalSize {
  width: number;
  height: number;
}

interface HostEntry {
  /** Placeholder identity (pathStorageKey) — stable across remounts. */
  key: string;
  /** `${sandboxId}:${port}` — evicted together when the sandbox stops. */
  group: string;
  src: string;
  /** Bump = deliberate reload; the host remounts the iframe on change. */
  epoch: number;
  anchor: HTMLElement | null;
  rect: Rect | null;
  element: HTMLIFrameElement | null;
  /** Guest CSS viewport; null = fill the placeholder. */
  logical: LogicalSize | null;
  /** Device emulation active — host wrapper draws the device edge borders. */
  bordered: boolean;
  attachedAt: number;
}

/** Hidden iframes keep running dev apps (HMR sockets, timers) — cap RAM. */
const MAX_IFRAMES = 3;

/**
 * A mini-player drag or resize in flight, as offsets from the anchor's rect at
 * press. Moving a window changes neither its size nor any scroll position, so
 * nothing would tell the host to re-measure; and measuring after the fact
 * paints the iframe a frame behind the window it sits in. The window publishes
 * the offsets it is applying instead, and the overlay takes them in the same
 * commit.
 */
export interface PreviewGesture {
  /** Anchor being manipulated — every other overlay is unaffected. */
  key: string;
  dx: number;
  dy: number;
  dWidth: number;
  dHeight: number;
}

const entries = new Map<string, HostEntry>();
const metaByGroup = new Map<string, PreviewMeta>();
const onElementByKey = new Map<
  string,
  (el: HTMLIFrameElement | null) => void
>();
const listeners = new Set<() => void>();
let snapshot: ReadonlyArray<HostEntry> = [];
let gesture: PreviewGesture | null = null;

function notify(): void {
  snapshot = Array.from(entries.values());
  for (const listener of listeners) {
    listener();
  }
}

export function setPreviewGesture(next: PreviewGesture): void {
  gesture = next;
  notify();
}

/**
 * Ends the gesture on the next frame, once the released window has committed
 * its final position: the offsets are dropped and the anchors re-measured in
 * one notify, so no frame paints at the pre-gesture rect.
 */
export function endPreviewGesture(): void {
  if (gesture === null) return;
  requestAnimationFrame(() => {
    if (gesture === null) return;
    gesture = null;
    for (const [key, entry] of entries) {
      if (entry.anchor === null) continue;
      entries.set(key, { ...entry, rect: measure(entry.anchor) });
    }
    notify();
  });
}

function getPreviewGesture(): PreviewGesture | null {
  return gesture;
}

/** The rect to paint at: the measured anchor, plus any live gesture offsets. */
export function overlayRect(
  entry: { key: string; rect: Rect | null },
  live: PreviewGesture | null,
): Rect | null {
  if (entry.rect === null) return null;
  if (live === null || live.key !== entry.key) return entry.rect;
  return {
    top: entry.rect.top + live.dy,
    left: entry.rect.left + live.dx,
    width: entry.rect.width + live.dWidth,
    height: entry.rect.height + live.dHeight,
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ReadonlyArray<HostEntry> {
  return snapshot;
}

function measure(anchor: HTMLElement): Rect {
  const rect = anchor.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height
  );
}

let remeasureRaf = 0;

/** Coalesce scroll/resize/RO into one measure per frame. */
function scheduleRemeasure(): void {
  if (remeasureRaf !== 0) return;
  remeasureRaf = requestAnimationFrame(() => {
    remeasureRaf = 0;
    remeasureAll();
  });
}

/** Re-reads every anchored placeholder's rect; notifies only on change. */
function remeasureAll(): void {
  // Mid-gesture the anchor has already moved, so re-measuring it here would
  // double-count the offsets the window is publishing.
  if (gesture !== null) return;
  let changed = false;
  for (const [key, entry] of entries) {
    if (entry.anchor === null) continue;
    const rect = measure(entry.anchor);
    if (!sameRect(rect, entry.rect)) {
      entries.set(key, { ...entry, rect });
      changed = true;
    }
  }
  if (changed) notify();
}

/**
 * Window-level layout listeners exist only while at least one placeholder is
 * attached. Scroll uses capture so scrolling inside any container repositions
 * the overlay, not just document scrolls.
 */
let layoutListenerCount = 0;
function acquireLayoutListeners(): void {
  layoutListenerCount += 1;
  if (layoutListenerCount > 1) return;
  window.addEventListener("resize", scheduleRemeasure);
  window.addEventListener("scroll", scheduleRemeasure, true);
  document.addEventListener("fullscreenchange", scheduleRemeasure);
}
function releaseLayoutListeners(): void {
  layoutListenerCount -= 1;
  if (layoutListenerCount > 0) return;
  window.removeEventListener("resize", scheduleRemeasure);
  window.removeEventListener("scroll", scheduleRemeasure, true);
  document.removeEventListener("fullscreenchange", scheduleRemeasure);
}

function evictOverCap(): void {
  if (entries.size <= MAX_IFRAMES) return;
  let oldest: HostEntry | null = null;
  for (const entry of entries.values()) {
    // Anchored = a mounted panel is showing it; never evict those.
    if (entry.anchor !== null) continue;
    if (oldest === null || entry.attachedAt < oldest.attachedAt) {
      oldest = entry;
    }
  }
  if (oldest !== null) {
    entries.delete(oldest.key);
  }
}

interface AttachOptions {
  anchor: HTMLElement;
  group: string;
  /** Undefined = nothing to show (loading/error) — hides any cached iframe. */
  src: string | undefined;
  epoch: number;
  logical: LogicalSize | null;
  /** Receives the live iframe element (panels wire it into iframeRef). */
  onElement: (el: HTMLIFrameElement | null) => void;
  /** A pane anchor wins over an auto mini-player; a mini-player anchor does not. */
  role: PreviewAnchorRole;
  /**
   * Pane only: float into the mini-player if this anchor detaches for good.
   * Undefined disarms (pane hidden, collapsed, mobile, or nothing to show).
   */
  miniPlayer?: PreviewMiniPlayerSource;
}

/**
 * Claims the host slot for `key` while the placeholder is mounted. Returns
 * the detach cleanup: the iframe is hidden but kept cached for the next visit.
 */
function attach(key: string, options: AttachOptions): (() => void) | undefined {
  const existing = entries.get(key);
  notePreviewAnchorAttached(key, options.role);

  if (options.src === undefined) {
    // Loading or error state — the panel is showing an overlay there instead.
    if (options.role === "panel") disarmPreviewMiniPlayer(key);
    if (existing !== undefined) {
      entries.set(key, { ...existing, anchor: null, rect: null });
      notify();
    }
    return undefined;
  }

  const sameEpoch = existing !== undefined && existing.epoch === options.epoch;
  entries.set(key, {
    key,
    group: options.group,
    // Same epoch = the cached document must be kept; a revalidated src for
    // the same target carries a fresh grant and would reload it.
    src: sameEpoch ? existing.src : options.src,
    epoch: options.epoch,
    anchor: options.anchor,
    rect: measure(options.anchor),
    element: sameEpoch ? existing.element : null,
    logical: options.logical,
    // Device chrome belongs on the pane's contained box, not the mini-player
    // body — that overlay is the letterbox, so a border there would frame the
    // bars instead of the page.
    bordered: options.role === "panel" && options.logical !== null,
    attachedAt: Date.now(),
  });
  evictOverCap();

  onElementByKey.set(key, options.onElement);
  const current = entries.get(key);
  options.onElement(current?.element ?? null);

  if (options.role === "panel") {
    if (options.miniPlayer !== undefined && current !== undefined) {
      armPreviewMiniPlayer({
        ...options.miniPlayer,
        entryKey: key,
        group: current.group,
        src: current.src,
        epoch: current.epoch,
        logicalSize: resolveMiniPlayerLogicalSize(
          options.logical,
          measure(options.anchor),
        ),
      });
    } else {
      disarmPreviewMiniPlayer(key);
    }
  }

  const observer = new ResizeObserver(() => {
    scheduleRemeasure();
  });
  observer.observe(options.anchor);
  acquireLayoutListeners();
  notify();

  return () => {
    observer.disconnect();
    releaseLayoutListeners();
    if (onElementByKey.get(key) === options.onElement) {
      onElementByKey.delete(key);
    }
    options.onElement(null);
    const entry = entries.get(key);
    // Only the anchor that still owns the slot un-anchors it; a superseded
    // anchor (pane took over from the mini-player) must not report a detach.
    if (entry !== undefined && entry.anchor === options.anchor) {
      entries.set(key, { ...entry, anchor: null, rect: null });
      notify();
      notePreviewAnchorDetached(key);
    }
  };
}

/**
 * Stable per-key iframe ref callbacks. Inline closures would change identity
 * every host render, making React detach/re-run them and ping-pong `notify`
 * into an infinite render loop.
 */
const iframeRefByKey = new Map<
  string,
  (el: HTMLIFrameElement | null) => void
>();
function iframeRefFor(key: string): (el: HTMLIFrameElement | null) => void {
  const cached = iframeRefByKey.get(key);
  if (cached !== undefined) return cached;
  const callback = (el: HTMLIFrameElement | null) => {
    const entry = entries.get(key);
    if (entry === undefined || entry.element === el) return;
    entries.set(key, { ...entry, element: el });
    onElementByKey.get(key)?.(el);
    notify();
  };
  iframeRefByKey.set(key, callback);
  return callback;
}

export function getPreviewMeta(group: string): PreviewMeta | undefined {
  return metaByGroup.get(group);
}

export function setPreviewMeta(group: string, meta: PreviewMeta): void {
  metaByGroup.set(group, meta);
}

/** Sandbox stopped: every port's cached documents are dead weight — free them. */
export function dropPreviewGroup(sandboxId: string): void {
  dropPreviewMiniPlayerForSandbox(sandboxId);
  const prefix = `${sandboxId}:`;
  for (const key of Array.from(metaByGroup.keys())) {
    if (key.startsWith(prefix)) {
      metaByGroup.delete(key);
    }
  }
  let changed = false;
  for (const [key, entry] of entries) {
    if (entry.group === sandboxId || entry.group.startsWith(prefix)) {
      entries.delete(key);
      changed = true;
    }
  }
  if (changed) notify();
}

/** Live iframe element for a placeholder key (null until the host mounts it). */
export function usePreviewIframeElement(key: string): HTMLIFrameElement | null {
  return useSyncExternalStore(
    subscribe,
    () => entries.get(key)?.element ?? null,
  );
}

function subscribeFullscreen(listener: () => void): () => void {
  document.addEventListener("fullscreenchange", listener);
  return () => document.removeEventListener("fullscreenchange", listener);
}

export function useFullscreenElement(): Element | null {
  return useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenElement,
  );
}

/**
 * The root-mounted overlay that owns every preview iframe. z-40 keeps the
 * iframes above routed content (their rect never covers anything but the
 * placeholder) while Radix portals (z-50) still stack above them.
 */
export function PreviewIframeHost() {
  const hosted = useSyncExternalStore(subscribe, getSnapshot);
  const live = useSyncExternalStore(subscribe, getPreviewGesture);

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {hosted.map((entry) => {
        const rect = overlayRect(entry, live);
        const visible = rect !== null && rect.width > 0 && rect.height > 0;
        const logical = entry.logical;
        const contained =
          logical && rect ? previewContainedLayout(rect, logical) : null;
        return (
          <div
            key={entry.key}
            className={cn(
              "absolute overflow-hidden",
              // Dark canvas so contain letterbox reads as bars, not leftover
              // chrome — muted matches the title bar and hides the ratio.
              logical ? "bg-black" : "bg-background",
              // Iframes swallow pointer events, so every overlay goes inert
              // for the duration of a gesture, not just the dragged one.
              live !== null ? "pointer-events-none" : "pointer-events-auto",
              entry.bordered && "border border-border",
              !visible && "hidden",
            )}
            style={
              visible && rect !== null
                ? {
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                  }
                : undefined
            }
          >
            <iframe
              key={entry.epoch}
              ref={iframeRefFor(entry.key)}
              src={entry.src}
              title="Preview"
              className={
                logical ? "block border-0" : "block size-full border-0"
              }
              style={
                logical && contained
                  ? {
                      width: logical.width,
                      height: logical.height,
                      transform: `translate(${contained.offsetX}px, ${contained.offsetY}px) scale(${contained.scale})`,
                      transformOrigin: "top left",
                    }
                  : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}

interface PreviewAnchorProps {
  /** Stable placeholder identity — the panel's pathStorageKey. */
  entryKey: string;
  /** `${sandboxId}:${port}` for group eviction. */
  group: string;
  src: string | undefined;
  epoch: number;
  /** Guest CSS viewport; null = fill the placeholder. */
  logicalSize: { width: number; height: number } | null;
  role: PreviewAnchorRole;
  /** Pane only — see {@link AttachOptions.miniPlayer}. */
  miniPlayer?: PreviewMiniPlayerSource;
  onElement?: (el: HTMLIFrameElement | null) => void;
}

/**
 * The measured placeholder the host overlays its iframe on. Context-free so
 * the mini-player can host the same entry without a WebPreview provider.
 *
 * The anchor div is keyed by everything the host reads at attach time, so a
 * change remounts it and re-runs the ref callback — an explicit update
 * channel that does not depend on closure identity. A keyed remount is a
 * detach + attach in one commit, which the mini-player store treats as no
 * detach at all.
 */
export function PreviewAnchor({
  entryKey,
  group,
  src,
  epoch,
  logicalSize,
  role,
  miniPlayer,
  onElement,
}: PreviewAnchorProps) {
  const logicalKey = logicalSize
    ? `${logicalSize.width}x${logicalSize.height}`
    : "fill";
  const armKey =
    miniPlayer === undefined
      ? "idle"
      : `${miniPlayer.sessionId}:${miniPlayer.sandboxId}:${miniPlayer.returnTo}:${miniPlayer.title}`;

  return (
    <div
      key={`${epoch}:${src ?? ""}:${logicalKey}:${armKey}`}
      ref={(node) => {
        if (node === null) return undefined;
        return attach(entryKey, {
          anchor: node,
          group,
          src,
          epoch,
          logical: logicalSize,
          role,
          miniPlayer,
          onElement: onElement ?? (() => undefined),
        });
      }}
      className="size-full"
    />
  );
}

interface PersistentPreviewBodyProps extends Omit<
  PreviewAnchorProps,
  "role" | "src" | "onElement"
> {
  src: string | undefined;
  /** True while an error overlay must show — hides the hosted iframe. */
  covered: boolean;
  loading?: React.ReactNode;
}

/**
 * Drop-in replacement for WebPreviewBody: renders the pane's
 * {@link PreviewAnchor} and wires the hosted iframe element into the
 * enclosing WebPreview's iframeRef so nav/history/annotation consumers keep
 * working.
 */
export function PersistentPreviewBody({
  src,
  covered,
  loading,
  ...anchor
}: PersistentPreviewBodyProps) {
  const { iframeRef } = useWebPreview();

  return (
    <div className="relative size-full min-h-0 overflow-hidden">
      <PreviewAnchor
        {...anchor}
        src={covered ? undefined : src}
        role="panel"
        onElement={(el) => {
          iframeRef.current = el;
        }}
      />
      {loading}
    </div>
  );
}
