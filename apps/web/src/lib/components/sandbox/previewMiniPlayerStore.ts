import { useSyncExternalStore } from "react";
import type { Id } from "@eva/backend";

/**
 * Preview mini-player (picture-in-picture) state.
 *
 * A session's Preview pane can keep running in a floating window after the
 * user leaves the sessions area. The window shows the SAME hosted iframe as
 * the pane did (see previewIframeHost), so the app under development is not
 * reloaded — this store only decides WHICH entry floats and WHY:
 *
 * - `auto`: the visible pane armed itself, then its anchor detached (route
 *   change out of `/sessions/*`). The pane re-attaching closes it again.
 * - `manual`: the user pressed "Pop out". The pane shows a placeholder until
 *   the user brings the preview back or expands it.
 *
 * Arming is a declaration ("if this anchor detaches, float it with these
 * details"), not a subscription: it outlives the pane's unmount on purpose,
 * because the unmount is precisely the moment it is needed.
 */

type PreviewMiniPlayerMode = "auto" | "manual";

/** What the pane knows and the host does not: where the preview belongs. */
export interface PreviewMiniPlayerSource {
  sessionId: Id<"sessions">;
  sandboxId: string;
  /** Route of the session's Preview tab — Expand navigates here. */
  returnTo: string;
  title: string;
}

export interface PreviewMiniPlayerTarget extends PreviewMiniPlayerSource {
  /** Placeholder identity shared with the hosted iframe (pathStorageKey). */
  entryKey: string;
  /** `${sandboxId}:${port}` — dropped with the sandbox. */
  group: string;
  src: string;
  epoch: number;
  /**
   * Guest CSS viewport to contain inside the window. Missing = 1280×800, so a
   * fill pane still letterboxes instead of reflowing into the chrome.
   */
  logicalSize?: { width: number; height: number };
}

export interface PreviewMiniPlayerEntry extends PreviewMiniPlayerTarget {
  mode: PreviewMiniPlayerMode;
}

export type PreviewAnchorRole = "panel" | "miniPlayer";

let current: PreviewMiniPlayerEntry | null = null;
/** At most one pane is visible at a time, so one armed slot is enough. */
let armed: PreviewMiniPlayerTarget | null = null;
/** Keys whose detach is waiting a microtask to see whether they re-attach. */
const pendingFloat = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setCurrent(next: PreviewMiniPlayerEntry | null): void {
  if (current === next) return;
  current = next;
  notify();
}

export function getPreviewMiniPlayer(): PreviewMiniPlayerEntry | null {
  return current;
}

export function usePreviewMiniPlayer(): PreviewMiniPlayerEntry | null {
  return useSyncExternalStore(subscribe, getPreviewMiniPlayer, () => null);
}

export function openPreviewMiniPlayer(entry: PreviewMiniPlayerEntry): void {
  pendingFloat.delete(entry.entryKey);
  setCurrent(entry);
}

/**
 * Also disarms: every close path (×, Expand, Bring back, panel re-attach) is
 * followed by the pane re-arming itself if it is still showing, and a close
 * that left the arm in place would re-float on the very next detach.
 */
export function closePreviewMiniPlayer(): void {
  if (current !== null) {
    pendingFloat.delete(current.entryKey);
    armed = armed?.entryKey === current.entryKey ? null : armed;
  }
  setCurrent(null);
}

export function armPreviewMiniPlayer(target: PreviewMiniPlayerTarget): void {
  armed = target;
}

export function disarmPreviewMiniPlayer(entryKey: string): void {
  if (armed?.entryKey === entryKey) armed = null;
  pendingFloat.delete(entryKey);
}

/** Test seam — the armed slot has no UI of its own. */
export function getArmedPreviewMiniPlayer(): PreviewMiniPlayerTarget | null {
  return armed;
}

/**
 * Host → store: an anchor for `entryKey` claimed the hosted iframe. Cancels a
 * pending auto-float. A pane anchor also wins over an auto mini-player for the
 * same key (the user is back where the preview lives); a manual one stays put
 * because the pane renders a placeholder instead of an anchor while it floats.
 */
export function notePreviewAnchorAttached(
  entryKey: string,
  role: PreviewAnchorRole,
): void {
  pendingFloat.delete(entryKey);
  if (
    role === "panel" &&
    current?.entryKey === entryKey &&
    current.mode === "auto"
  ) {
    setCurrent(null);
  }
}

/**
 * Host → store: the anchor for `entryKey` detached and nothing replaced it.
 * Waits a microtask so a keyed remount (detach + attach in one commit) does
 * not float; a real unmount has no attach coming and floats after it.
 */
export function notePreviewAnchorDetached(entryKey: string): void {
  if (armed?.entryKey !== entryKey) return;
  if (current?.entryKey === entryKey) return;
  pendingFloat.add(entryKey);
  queueMicrotask(() => {
    if (!pendingFloat.delete(entryKey)) return;
    if (armed?.entryKey !== entryKey) return;
    if (current?.entryKey === entryKey) return;
    setCurrent({ ...armed, mode: "auto" });
  });
}

/** Sandbox stopped or replaced: its floating preview is a dead document. */
export function dropPreviewMiniPlayerForSandbox(sandboxId: string): void {
  if (armed?.sandboxId === sandboxId) {
    pendingFloat.delete(armed.entryKey);
    armed = null;
  }
  if (current?.sandboxId === sandboxId) {
    setCurrent(null);
  }
}
