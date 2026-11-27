"use client";

import { useSyncExternalStore } from "react";

/**
 * Which preview iframes are mid document load — the browser-tab spinner.
 *
 * Keyed by element so the host (which owns the iframe and sees every `load`,
 * even while no nav bar is mounted) and the nav bar (which starts loads by
 * assigning `src`) share one answer. A load starts when an iframe mounts,
 * when Eva assigns its `src`, or when the injected nav-sync script reports
 * `beforeunload`; it ends on the iframe's `load` event. SPA route changes are
 * same-document, so — as in a browser — they do not spin.
 */
const loading = new WeakSet<HTMLIFrameElement>();
const listeners = new Set<() => void>();

export function setPreviewDocumentLoading(
  iframe: HTMLIFrameElement,
  value: boolean,
): void {
  if (loading.has(iframe) === value) return;
  if (value) {
    loading.add(iframe);
  } else {
    loading.delete(iframe);
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePreviewDocumentLoading(
  iframe: HTMLIFrameElement | null,
): boolean {
  return useSyncExternalStore(subscribe, () =>
    iframe === null ? false : loading.has(iframe),
  );
}
