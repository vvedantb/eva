"use client";

import { useSyncExternalStore } from "react";

/**
 * Open state for the one mounted `ShortcutsCheatsheet`.
 *
 * It lives in a module rather than a context because the openers have nothing
 * else to say to the dialog: spotlight opens it from inside another overlay,
 * and the `showShortcuts` shortcut toggles it from the dialog itself. A
 * provider for a single boolean would be a wrapper around every route for no
 * other purpose.
 */
let open = false;
const listeners = new Set<() => void>();

function emit(next: boolean) {
  if (next === open) return;
  open = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return open;
}

/** Opens the cheatsheet from anywhere — spotlight's "Keyboard shortcuts". */
export function openShortcutsCheatsheet(): void {
  emit(true);
}

export function closeShortcutsCheatsheet(): void {
  emit(false);
}

export function setShortcutsCheatsheetOpen(next: boolean): void {
  emit(next);
}

/** The `showShortcuts` shortcut: same combo opens and dismisses. */
export function toggleShortcutsCheatsheet(): void {
  emit(!open);
}

export function useShortcutsCheatsheetOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
