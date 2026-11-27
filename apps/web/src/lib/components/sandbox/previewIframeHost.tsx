"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@eva/ui";
import { DOCK_MOTION_EVENT, useWebPreview } from "@vvedantb/ui";
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
import { setPreviewDocumentLoading } from "./previewDocumentLoading";

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
  key: string;
  group: string;
  src: string;
  epoch: number;
  anchor: HTMLElement | null;
  rect: Rect | null;
  element: HTMLIFrameElement | null;
  logical: LogicalSize | null;
  bordered: boolean;
  attachedAt: number;
}
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

const movingPanels = new Map<Element, number>();

function onDockMotion(event: Event): void {
  if (!("ms" in event) || typeof event.ms !== "number") return;
  const panel = event.target;
  if (!(panel instanceof Element)) return;
  window.clearTimeout(movingPanels.get(panel));
  movingPanels.set(
    panel,
    window.setTimeout(() => {
      movingPanels.delete(panel);
      for (const [key, entry] of entries) {
        if (entry.anchor === null) continue;
        entries.set(key, { ...entry, rect: measure(entry.anchor) });
      }
      notify();
    }, event.ms),
  );
  notify();
}

if (typeof document !== "undefined") {
  document.addEventListener(DOCK_MOTION_EVENT, onDockMotion);
}

function isSteppedAside(anchor: HTMLElement | null): boolean {
  if (anchor === null) return false;
  for (const panel of movingPanels.keys()) {
    if (panel.contains(anchor)) return true;
  }
  return false;
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
function anchorNeedsLayoutTracking(anchor: HTMLElement): boolean {
  if (document.visibilityState !== "visible") return false;
  const rect = anchor.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function hasActiveLayoutAnchor(): boolean {
  for (const entry of entries.values()) {
    if (entry.anchor !== null && anchorNeedsLayoutTracking(entry.anchor)) {
      return true;
    }
  }
  return false;
}

let layoutListenersAttached = false;
function syncLayoutListeners(): void {
  const shouldAttach = hasActiveLayoutAnchor();
  if (shouldAttach && !layoutListenersAttached) {
    window.addEventListener("resize", scheduleRemeasure);
    window.addEventListener("scroll", scheduleRemeasure, true);
    document.addEventListener("fullscreenchange", scheduleRemeasure);
    layoutListenersAttached = true;
  } else if (!shouldAttach && layoutListenersAttached) {
    window.removeEventListener("resize", scheduleRemeasure);
    window.removeEventListener("scroll", scheduleRemeasure, true);
    document.removeEventListener("fullscreenchange", scheduleRemeasure);
    layoutListenersAttached = false;
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      remeasureAll();
      return;
    }
    syncLayoutListeners();
  });
}
function scheduleRemeasure(): void {
  if (document.visibilityState !== "visible") return;
  if (remeasureRaf !== 0) return;
  remeasureRaf = requestAnimationFrame(() => {
    remeasureRaf = 0;
    remeasureAll();
  });
}
function remeasureAll(): void {
  if (gesture !== null) return;
  if (document.visibilityState !== "visible") {
    syncLayoutListeners();
    return;
  }
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
  syncLayoutListeners();
}

function evictOverCap(): void {
  if (entries.size <= MAX_IFRAMES) return;
  let oldest: HostEntry | null = null;
  for (const entry of entries.values()) {
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
  src: string | undefined;
  epoch: number;
  logical: LogicalSize | null;
  onElement: (el: HTMLIFrameElement | null) => void;
  role: PreviewAnchorRole;
  miniPlayer?: PreviewMiniPlayerSource;
}

function attach(key: string, options: AttachOptions): (() => void) | undefined {
  const existing = entries.get(key);
  notePreviewAnchorAttached(key, options.role);

  if (options.src === undefined) {
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
    src: sameEpoch ? existing.src : options.src,
    epoch: options.epoch,
    anchor: options.anchor,
    rect: measure(options.anchor),
    element: sameEpoch ? existing.element : null,
    logical: options.logical,
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
  syncLayoutListeners();
  notify();

  return () => {
    observer.disconnect();
    if (onElementByKey.get(key) === options.onElement) {
      onElementByKey.delete(key);
    }
    options.onElement(null);
    const entry = entries.get(key);
    if (entry !== undefined && entry.anchor === options.anchor) {
      entries.set(key, { ...entry, anchor: null, rect: null });
      notify();
      notePreviewAnchorDetached(key);
    }
    syncLayoutListeners();
  };
}

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
    if (el !== null) setPreviewDocumentLoading(el, true);
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
        const steppedAside = isSteppedAside(entry.anchor);
        const logical = entry.logical;
        const contained =
          logical && rect ? previewContainedLayout(rect, logical) : null;
        return (
          <div
            key={entry.key}
            className={cn(
              "absolute overflow-hidden",
              logical ? "bg-black" : "bg-background",
              live !== null || steppedAside
                ? "pointer-events-none"
                : "pointer-events-auto",
              steppedAside ? "opacity-0" : "transition-opacity duration-150",
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
              allow="tools"
              onLoad={(event) => {
                setPreviewDocumentLoading(event.currentTarget, false);
              }}
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
  entryKey: string;
  group: string;
  src: string | undefined;
  epoch: number;
  logicalSize: { width: number; height: number } | null;
  role: PreviewAnchorRole;  miniPlayer?: PreviewMiniPlayerSource;
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
      : `${miniPlayer.owner.kind}:${miniPlayer.sandboxId}:${miniPlayer.returnTo}:${miniPlayer.title}`;

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
