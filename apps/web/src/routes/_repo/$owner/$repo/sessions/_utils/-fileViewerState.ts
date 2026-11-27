// The File Viewer's load state machine and its pure helpers. Split out of the
// panel so the header and the body can both name the state without importing
// the component that owns it.

import type { MediaFile } from "./-fileViewerMedia";

/** A file the viewer successfully read: either text, or media as a data URL. */
export type LoadedPayload =
  | { kind: "loaded"; content: string; truncated: boolean }
  | { kind: "media"; media: MediaFile; dataUrl: string };

/**
 * Local (not live-query) state: reading a file is a one-shot action, not a
 * reactive query, so the result is held in the panel and re-fetched on demand.
 */
export type ViewerState =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "not_running" }
  | { kind: "not_found" }
  | { kind: "binary" }
  | { kind: "too_large"; size: number }
  | { kind: "error"; message: string }
  | LoadedPayload;

export function fileCacheKey(sandboxId: string, path: string): string {
  return `${sandboxId} ${path}`;
}

export function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

/** Why Edit is unavailable, or null when the file can be edited. */
export function editBlockedReason(
  state: ViewerState,
  canWrite: boolean,
): string | null {
  if (!canWrite) return "Wake Eva up to edit files";
  if (state.kind === "media") return "Media files are read-only here";
  if (state.kind === "binary") return "Binary files are read-only";
  if (state.kind !== "loaded") return "Wait for the file to load";
  // A truncated read only holds the first 512 KB, so saving it would delete
  // the rest of the file. The write action refuses the same size for the same
  // reason.
  if (state.truncated) return "Files over 512 KB are read-only";
  return null;
}
