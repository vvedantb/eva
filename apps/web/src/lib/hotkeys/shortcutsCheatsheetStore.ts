"use client";

import { useSyncExternalStore } from "react";

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
