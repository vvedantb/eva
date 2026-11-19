import { useSyncExternalStore } from "react";
import type { Id } from "@eva/backend";

/**
 * "Close without merging" asks first, but menus unmount their content the
 * moment an item is chosen, taking any dialog state with them. So a menu item
 * only records the request here, and `PrCloseDialogHost` (mounted once at the
 * root) owns the dialog and the GitHub call.
 */
export interface PrCloseTarget {
  repoId: Id<"githubRepos">;
  prNumber: number;
}

let current: PrCloseTarget | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function requestPrClose(target: PrCloseTarget | null): void {
  current = target;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePrCloseRequest(): PrCloseTarget | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
