"use client";

import { Suspense, lazy } from "react";
import type { ThemeTypes } from "@pierre/diffs";
import { Button, MessageResponse, Spinner } from "@eva/ui";
import { IconRefresh } from "@tabler/icons-react";
import { ScreenshotPreview, VideoPreview } from "@/lib/components/MediaPreview";
import { formatBytes, type ViewerState } from "../_utils/-fileViewerState";
import { SandboxFileCode } from "./SandboxFileCode";
import { ViewerNotice } from "./ViewerNotice";

// `@pierre/diffs/edit` is a whole text editor. Nobody who only reads files
// should pay to download it, so it arrives when Edit is first pressed.
const SandboxFileEditor = lazy(async () => {
  const module = await import("./SandboxFileEditor");
  return { default: module.SandboxFileEditor };
});

interface FileViewerBodyProps {
  state: ViewerState;
  /** Absolute sandbox path, used as the media alt text. */
  filePath: string;
  /** Repo-relative path handed to the highlighter. */
  name: string;
  cacheKey: string;
  wrap: boolean;
  resolvedTheme: ThemeTypes;
  editing: boolean;
  renderMarkdown: boolean;
  onRetry: () => void;
  onDraftChange: (contents: string) => void;
  onSaveShortcut: () => void;
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner size="sm" />
    </div>
  );
}

/** Everything below the viewer header: the state machine's non-header output. */
export function FileViewerBody({
  state,
  filePath,
  name,
  cacheKey,
  wrap,
  resolvedTheme,
  editing,
  renderMarkdown,
  onRetry,
  onDraftChange,
  onSaveShortcut,
}: FileViewerBodyProps) {
  if (state.kind === "loading") return <Loading />;
  if (state.kind === "empty") {
    return <ViewerNotice message="Select a file to view it" />;
  }
  if (state.kind === "not_running") {
    return <ViewerNotice message="Wake Eva up to view files" />;
  }
  if (state.kind === "not_found") {
    return <ViewerNotice message="This file no longer exists in the sandbox" />;
  }
  if (state.kind === "binary") {
    return <ViewerNotice message="This file is binary and cannot be shown" />;
  }
  if (state.kind === "too_large") {
    return (
      <ViewerNotice
        message={`This file is ${formatBytes(state.size)}. Previews are limited to 4 MB.`}
      />
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <pre className="max-h-48 max-w-full overflow-auto scroll-fade whitespace-pre-wrap rounded-surface bg-destructive/5 p-3 text-sm text-destructive">
          {state.message}
        </pre>
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <IconRefresh className="mr-1 size-4" />
          Retry
        </Button>
      </div>
    );
  }
  if (state.kind === "media") {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        {state.media.kind === "image" ? (
          <ScreenshotPreview url={state.dataUrl} alt={filePath} />
        ) : (
          <VideoPreview url={state.dataUrl} className="w-full" />
        )}
      </div>
    );
  }

  return (
    <>
      {state.truncated ? (
        <p className="border-b border-border bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground">
          Showing the first 512 KB of this file.
        </p>
      ) : null}
      {renderMarkdown ? (
        <MessageResponse className="prose prose-sm dark:prose-invert max-w-none px-4 py-3">
          {state.content}
        </MessageResponse>
      ) : editing ? (
        <Suspense fallback={<Loading />}>
          <SandboxFileEditor
            name={name}
            contents={state.content}
            cacheKey={cacheKey}
            wrap={wrap}
            resolvedTheme={resolvedTheme}
            onDraftChange={onDraftChange}
            onSaveShortcut={onSaveShortcut}
          />
        </Suspense>
      ) : (
        <SandboxFileCode
          name={name}
          contents={state.content}
          cacheKey={cacheKey}
          wrap={wrap}
          resolvedTheme={resolvedTheme}
        />
      )}
    </>
  );
}
