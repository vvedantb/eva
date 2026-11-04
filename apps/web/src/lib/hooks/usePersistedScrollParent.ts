"use client";

import { usePersistedScrollParent as usePackageScrollParent } from "@vvedantb/ui";

const STORAGE_PREFIX = "eva:list-scroll:";

/**
 * `@vvedantb/ui`'s persisted scroll container under eva's own session-storage
 * namespace, so saved list positions keep their keys.
 */
export function usePersistedScrollParent(storageKey: string) {
  return usePackageScrollParent(STORAGE_PREFIX + storageKey);
}
