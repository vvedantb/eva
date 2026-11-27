"use client";

import { useSyncExternalStore } from "react";

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
