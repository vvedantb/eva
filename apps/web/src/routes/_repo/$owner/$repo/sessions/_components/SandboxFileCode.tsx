"use client";

import type { FileOptions } from "@pierre/diffs/react";
import type { ThemeTypes } from "@pierre/diffs";
import { File } from "@pierre/diffs/react";
import { DIFF_THEMES } from "@/lib/components/sandbox/diffWorkerPool";

/** Everything both the read-only and the editable surface need. */
export interface SandboxFileSurfaceProps {
  /** Repo-relative path — `@pierre/diffs` infers the language from it. */
  name: string;
  contents: string;
  /**
   * Highlight cache identity. Must change whenever `contents` does, or the
   * component re-renders the previous file's tokens.
   */
  cacheKey: string;
  wrap: boolean;
  resolvedTheme: ThemeTypes;
}

/**
 * Render options shared by the viewer and the editor, so switching into edit
 * mode does not restyle the file underneath the caret. The theme is the same
 * constant the Review tab's diffs use — a file and its diff should not look
 * like they came from two different products.
 */
export function sandboxFileOptions({
  wrap,
  resolvedTheme,
}: Pick<
  SandboxFileSurfaceProps,
  "wrap" | "resolvedTheme"
>): FileOptions<undefined, undefined> {
  return {
    // The panel header owns the path, the toolbar and the edit controls.
    disableFileHeader: true,
    theme: DIFF_THEMES,
    themeType: resolvedTheme,
    overflow: wrap ? "wrap" : "scroll",
  };
}

/**
 * Read-only file surface for the session Files tab: line numbers and shiki
 * highlighting from `@pierre/diffs`, matching the Review tab's diffs.
 *
 * No worker pool provider here on purpose. A pool costs four shiki instances
 * and only pays off across a whole PR's worth of files; one file highlights on
 * the main thread fast enough, the same way `PlainDiff` does outside a review.
 */
export function SandboxFileCode({
  name,
  contents,
  cacheKey,
  wrap,
  resolvedTheme,
}: SandboxFileSurfaceProps) {
  return (
    <File
      file={{ name, contents, cacheKey }}
      options={sandboxFileOptions({ wrap, resolvedTheme })}
      className="min-h-full text-xs"
    />
  );
}
