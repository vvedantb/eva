"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { useQueryState } from "nuqs";
import { useLocalStorage } from "usehooks-ts";
import { toast } from "sonner";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { fileViewerPathParser, markdownViewParser } from "@/lib/search-params";
import { useThemeMode } from "@/lib/hooks/useThemeMode";
import { FileViewerBody } from "./_components/FileViewerBody";
import { FileViewerHeader } from "./_components/FileViewerHeader";
import type { FileViewerEditState } from "./_components/FileViewerEditControls";
import { ViewerNotice } from "./_components/ViewerNotice";
import { useSandboxFileContents } from "./_components/useSandboxFileContents";
import {
  fileBreadcrumbSegments,
  repoRelativeName,
} from "./_utils/-fileViewerPath";
import {
  editBlockedReason,
  fileCacheKey,
  formatBytes,
} from "./_utils/-fileViewerState";
import { isMarkdownPath } from "./_utils/-fileViewerMedia";

interface FileViewerPanelProps {
  sandboxId: string | undefined;
  repoId: Id<"githubRepos">;
  isActive: boolean;
  /** Sandbox repo root, so the breadcrumb reads as a repo-relative path. */
  root: string | null;
}

/** An open edit session. A `null` draft means untouched since it started/saved. */
interface EditSession {
  /** The sandbox+path the session belongs to; anything else abandons it. */
  key: string;
  draft: string | null;
  saving: boolean;
}

/**
 * Viewer and in-place editor for a single file read live from the session's
 * sandbox. The open file is driven by the `?file=` URL param, set when a file
 * chip in the chat or an entry in the tree is clicked.
 *
 * Text renders through `@pierre/diffs`, the same component the Review tab's
 * diffs use, so a file and its diff look like one product. Images and videos
 * are read separately as base64 and shown as data URLs; markdown renders by
 * default with a header toggle back to source.
 */
export function FileViewerPanel({
  sandboxId,
  repoId,
  isActive,
  root,
}: FileViewerPanelProps) {
  const writeSandboxFile = useAction(api.sandbox.writeSandboxFile);
  const { resolvedTheme } = useThemeMode();
  const [filePath] = useQueryState("file", fileViewerPathParser);
  const [markdownView, setMarkdownView] = useQueryState(
    "md",
    markdownViewParser,
  );
  // Wrapping is a reading preference, so it persists across files — the same
  // storage-backed toggle the Diffs tab uses for its own wrap control.
  const [wrap, setWrap] = useLocalStorage("eva:file-viewer-wrap", false);
  const { state, revision, refresh, install } = useSandboxFileContents({
    sandboxId,
    repoId,
    isActive,
    filePath,
  });
  const [editSession, setEditSession] = useState<EditSession | null>(null);

  const canEdit = Boolean(filePath) && Boolean(sandboxId) && isActive;
  const sessionKey =
    sandboxId && filePath && isActive ? fileCacheKey(sandboxId, filePath) : "";
  // Adjust-state-during-render rather than an effect: switching file, or the
  // sandbox stopping, must drop the draft before anything renders it against
  // the wrong file.
  if (editSession !== null && editSession.key !== sessionKey) {
    setEditSession(null);
  }

  const loadedContent = state.kind === "loaded" ? state.content : null;
  const draft = editSession === null ? null : editSession.draft;
  const dirty = draft !== null && draft !== loadedContent;

  const handleSave = () => {
    if (editSession === null || editSession.saving) return;
    if (!sandboxId || !filePath) return;
    const content = editSession.draft;
    // Clean is a no-op — the Cmd+S handler still swallows the event.
    if (content === null || content === loadedContent) return;
    const attempt = editSession.key;

    // Only ever touches the session it started in: the open file may have
    // changed while the write was in flight, and the user may have typed on,
    // in which case the draft stays dirty against the newly saved content.
    const settle = (saved: boolean) =>
      setEditSession((session) => {
        if (session === null || session.key !== attempt) return session;
        if (saved && session.draft === content) {
          return { ...session, draft: null, saving: false };
        }
        return { ...session, saving: false };
      });

    setEditSession({ ...editSession, saving: true });
    void (async () => {
      try {
        const res = await writeSandboxFile({
          sandboxId,
          repoId,
          path: filePath,
          content,
        });
        if (res.status === "ok") {
          install(content);
          settle(true);
        } else if (res.status === "not_running") {
          toast.error("Wake Eva up to save files");
          settle(false);
        } else {
          toast.error(
            `This file is ${formatBytes(res.size)}. Saves are limited to 512 KB.`,
          );
          settle(false);
        }
      } catch (err) {
        let message = "Failed to save file";
        if (err instanceof Error) message = err.message;
        toast.error(message);
        settle(false);
      }
    })();
  };

  // No file open, or nothing to read it from: a bare notice, without the
  // header's path and controls, which would have nothing to point at.
  if (state.kind === "empty") {
    return <ViewerNotice message="Select a file to view it" />;
  }
  if (state.kind === "not_running") {
    return <ViewerNotice message="Wake Eva up to view files" />;
  }

  const isMarkdown = isMarkdownPath(filePath);
  const editing = editSession !== null;
  const blockedReason = editBlockedReason(state, canEdit);

  const editControls: FileViewerEditState = (() => {
    if (editSession !== null) {
      return {
        kind: "editing",
        dirty,
        saving: editSession.saving,
        onDone: () => setEditSession(null),
        onDiscard: () => setEditSession(null),
        onSave: handleSave,
      };
    }
    if (blockedReason !== null) {
      return { kind: "unavailable", reason: blockedReason };
    }
    return {
      kind: "idle",
      onEdit: () => {
        // Editing the rendered preview would swap the body out from under the
        // caret, so move to source first.
        if (isMarkdown && markdownView === "rendered") {
          void setMarkdownView("source");
        }
        setEditSession({ key: sessionKey, draft: null, saving: false });
      },
    };
  })();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FileViewerHeader
        segments={fileBreadcrumbSegments(filePath, root)}
        title={filePath}
        dirty={dirty}
        markdown={
          state.kind === "loaded" && isMarkdown
            ? {
                view: markdownView,
                disabled: editing,
                onToggle: () =>
                  void setMarkdownView(
                    markdownView === "rendered" ? "source" : "rendered",
                  ),
              }
            : undefined
        }
        wrap={wrap}
        onWrapChange={setWrap}
        copyContent={loadedContent ?? undefined}
        onRefresh={refresh}
        edit={editControls}
      />

      <div className="flex-1 min-h-0 overflow-auto">
        <FileViewerBody
          state={state}
          filePath={filePath}
          name={repoRelativeName(filePath, root)}
          cacheKey={`${sandboxId ?? ""}:${filePath}:${revision}`}
          wrap={wrap}
          resolvedTheme={resolvedTheme}
          editing={editing}
          // Rendered markdown has no caret, so an edit session is source view.
          renderMarkdown={isMarkdown && markdownView === "rendered" && !editing}
          onRetry={refresh}
          onDraftChange={(contents) =>
            setEditSession((session) =>
              session === null ? session : { ...session, draft: contents },
            )
          }
          onSaveShortcut={handleSave}
        />
      </div>
    </div>
  );
}
