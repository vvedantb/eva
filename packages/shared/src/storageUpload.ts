import type { Id } from "@eva/backend";

/**
 * Extracts the storage ID from Convex's upload-URL response body, for the web
 * and mobile uploads. `response.storageId` is already the branded id, so
 * returning it needs no `as` cast.
 */
export function parseStorageId(text: string): Id<"_storage"> | null {
  try {
    const response = JSON.parse(text);
    return typeof response.storageId === "string" ? response.storageId : null;
  } catch {
    return null;
  }
}
