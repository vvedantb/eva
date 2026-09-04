"use client";

import { useState } from "react";
import {
  IconCheck,
  IconChevronRight,
  IconCode,
  IconCopy,
  IconMarkdown,
  IconRefresh,
  IconTextWrap,
} from "@tabler/icons-react";
import type { FileBreadcrumbSegment } from "../_utils/-fileViewerPath";
import {
  FileViewerEditControls,
  type FileViewerEditState,
} from "./FileViewerEditControls";
import { FileViewerToolbarButton } from "./FileViewerToolbarButton";

interface FileViewerHeaderProps {
  segments: FileBreadcrumbSegment[];
  /** Absolute sandbox path, shown on hover — the breadcrumb is relative. */
  title: string;
  dirty: boolean;
  /** Absent for non-markdown files and before the file has loaded. */
  markdown?: {
    view: "rendered" | "source";
    disabled: boolean;
    onToggle: () => void;
  };
  wrap: boolean;
  onWrapChange: (wrap: boolean) => void;
  /** Absent when there is no text to copy (media, or not loaded). */
  copyContent?: string;
  onRefresh: () => void;
  edit: FileViewerEditState;
}

function markdownToggleLabel(view: "rendered" | "source"): string {
  return view === "rendered" ? "Show source" : "Show rendered";
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <FileViewerToolbarButton
      label="Copy file contents"
      onClick={() => {
        void navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <IconCheck className="size-3.5" />
      ) : (
        <IconCopy className="size-3.5" />
      )}
    </FileViewerToolbarButton>
  );
}

/**
 * Breadcrumb path plus a compact icon toolbar for the file viewer. This is a
 * list/detail region divider, so the hairline underneath is the structural
 * kind rather than decoration.
 */
export function FileViewerHeader({
  segments,
  title,
  dirty,
  markdown,
  wrap,
  onWrapChange,
  copyContent,
  onRefresh,
  edit,
}: FileViewerHeaderProps) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
      {/* `direction: rtl` on the scroller starts it scrolled to the end, so a
          path too long for the header keeps its file name in view instead of
          its first directory. The inner strip flips back to ltr and fills the
          width, so a short path still sits on the left. */}
      <div
        className="min-w-0 flex-1 overflow-x-auto scrollbar-none [direction:rtl]"
        title={title}
      >
        <div className="flex w-max min-w-full items-center gap-1 text-xs [direction:ltr]">
          {segments.map((segment, index) => (
            // Keyed by the path so far: a repeated directory name (`src/src`)
            // would collide on the label alone.
            <span
              key={segments
                .slice(0, index + 1)
                .map((crumb) => crumb.label)
                .join("/")}
              className="flex shrink-0 items-center gap-1"
            >
              {index > 0 ? (
                <IconChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
              ) : null}
              <span
                className={
                  segment.isFile
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }
              >
                {segment.label}
              </span>
            </span>
          ))}
          {dirty ? (
            <span
              aria-label="Unsaved changes"
              className="size-1.5 shrink-0 rounded-full bg-primary"
            />
          ) : null}
        </div>
      </div>

      {markdown ? (
        <FileViewerToolbarButton
          label={markdownToggleLabel(markdown.view)}
          disabled={markdown.disabled}
          tooltip={
            markdown.disabled
              ? "Stop editing to preview"
              : markdownToggleLabel(markdown.view)
          }
          onClick={markdown.onToggle}
        >
          {markdown.view === "rendered" ? (
            <IconCode className="size-3.5" />
          ) : (
            <IconMarkdown className="size-3.5" />
          )}
        </FileViewerToolbarButton>
      ) : null}

      <FileViewerToolbarButton
        label={wrap ? "Stop wrapping lines" : "Wrap long lines"}
        pressed={wrap}
        onClick={() => onWrapChange(!wrap)}
      >
        <IconTextWrap className="size-3.5" />
      </FileViewerToolbarButton>

      {copyContent === undefined ? null : <CopyButton content={copyContent} />}

      <FileViewerToolbarButton
        label="Refresh file"
        tooltip={dirty ? "Save or discard changes first" : "Refresh"}
        disabled={dirty}
        onClick={onRefresh}
      >
        <IconRefresh className="size-3.5" />
      </FileViewerToolbarButton>

      <span className="mx-1 h-4 w-px shrink-0 bg-border" />

      <FileViewerEditControls edit={edit} />
    </div>
  );
}
