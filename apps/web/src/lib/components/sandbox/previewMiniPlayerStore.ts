import { useSyncExternalStore } from "react";
import type { SandboxOwner } from "@eva/backend";

type PreviewMiniPlayerMode = "auto" | "manual";

/** What the pane knows and the host does not: where the preview belongs. */
export interface PreviewMiniPlayerSource {
  owner: SandboxOwner;
  sandboxId: string;
  returnTo: string;
  title: string;
}

export interface PreviewMiniPlayerTarget extends PreviewMiniPlayerSource {
  entryKey: string;
  group: string;
  src: string;
  epoch: number;
  logicalSize?: { width: number; height: number };
}

export interface PreviewMiniPlayerEntry extends PreviewMiniPlayerTarget {
  mode: PreviewMiniPlayerMode;
}

export type PreviewAnchorRole = "panel" | "miniPlayer";

let current: PreviewMiniPlayerEntry | null = null;let armed: PreviewMiniPlayerTarget | null = null;const pendingFloat = new Set<string>();
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
