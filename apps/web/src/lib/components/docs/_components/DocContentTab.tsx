"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import type { Transaction } from "@tiptap/pm/state";
import { useTiptapSync } from "@convex-dev/prosemirror-sync/tiptap";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@eva/backend";
import { useQueryState } from "nuqs";
import { docModeParser, type DocMode } from "@/lib/search-params";
import { nanoid } from "nanoid";
import { Button, Spinner, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { IconMessage } from "@tabler/icons-react";
import { FloatingToc } from "../FloatingToc";
import { DocCommentsPanel } from "./DocCommentsPanel";
import { DocSaveStatus, type DocSaveState } from "./DocSaveStatus";
import { DocHistoryPanel } from "./DocHistoryPanel";
import { DocSuggestionsPanel } from "./DocSuggestionsPanel";
import { DocVersionDiff } from "./DocVersionDiff";
import {
  SuggestChangesKit,
  enableSuggesting,
  disableSuggesting,
  collectSuggestions,
  setContentUntracked,
} from "@/lib/components/editor/suggestChanges";
import {
  DocCommentMark,
  DocCommentHighlight,
  applyCommentAnchor,
  removeCommentAnchor,
  collectPresentAnchorIds,
  setCommentHighlightState,
  scrollToAnchor,
} from "../_utils/docCommentAnchors";
import { withMutationToast } from "@/lib/utils/mutationToast";

type Doc = NonNullable<FunctionReturnType<typeof api.docs.get>>;

/**
 * How long editing has to stop before a version is snapshotted. Two minutes
 * outlived most editing sessions, so a doc could be closed having never been
 * snapshotted at all.
 */
const VERSION_IDLE_MS = 15_000;

const baseEditorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
  }),
  Markdown.configure({
    markedOptions: { gfm: true },
  }),
];

export function DocContentTab({
  doc,
  commentsOpen,
  onToggleComments,
  historyOpen,
  onToggleHistory,
  suggestionsOpen,
  onToggleSuggestions,
  onSuggestionCount,
}: {
  doc: Doc;
  commentsOpen: boolean;
  onToggleComments: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
  suggestionsOpen: boolean;
  onToggleSuggestions: () => void;
  onSuggestionCount: (count: number) => void;
}) {
  "use no memo";
  const [mode] = useQueryState("mode", docModeParser);
  const isPrRecap = doc.kind === "pr-recap";
  const effectiveMode: DocMode = isPrRecap ? "viewing" : mode;
  const ensureSyncDoc = useMutation(api.docs.ensureSyncDoc);
  const touchDraft = useMutation(api.docVersions.touchDraft);
  const saveVersion = useMutation(api.docVersions.saveVersion);

  // Attribute new suggestions to the current user; a stable ref avoids
  // recreating the editor when auth resolves.
  const currentUserId = useQuery(api.auth.me);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = currentUserId ?? null;
  }, [currentUserId]);
  // Clicking a highlight routes here; the ref lets the (memoized once) editor
  // extension reach the latest handler without recreating the editor.
  const anchorClickRef = useRef<(anchorId: string) => void>(() => undefined);
  const extensions = [
    ...baseEditorExtensions,
    SuggestChangesKit.configure({ getUserId: () => userIdRef.current }),
    DocCommentMark,
    DocCommentHighlight.configure({
      onAnchorClick: (anchorId) => anchorClickRef.current(anchorId),
    }),
  ];

  const sync = useTiptapSync(api.prosemirrorSync, doc._id);

  const [composingAnchorId, setComposingAnchorId] = useState<string | null>(
    null,
  );
  const [composingAnchorText, setComposingAnchorText] = useState<string | null>(
    null,
  );
  const [activeAnchorId, setActiveAnchorId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] =
    useState<Id<"docVersions"> | null>(null);
  const [presentAnchorIds, setPresentAnchorIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // Cached query (shared with the panel). Open anchors = unresolved thread
  // roots plus the anchor currently being composed.
  const comments =
    useQuery(api.docComments.listByDoc, { docId: doc._id }) ?? [];
  const openAnchorIds = (() => {
    const ids = new Set<string>();
    for (const c of comments) {
      if (!c.parentId && c.resolvedAt === undefined && c.anchorId) {
        ids.add(c.anchorId);
      }
    }
    if (composingAnchorId) ids.add(composingAnchorId);
    return ids;
  })();

  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const [tocContent, setTocContent] = useState(doc.content);
  const lastTouchDraftRef = useRef<number>(0);
  const editCountRef = useRef<number>(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMigratedRef = useRef(false);
  const [docSaveState, setDocSaveState] = useState<DocSaveState>({
    status: "idle",
  });

  // Lazy migration: ensure sync doc exists for legacy docs
  const needsMigration =
    !sync.isLoading && sync.initialContent === null && "create" in sync;
  useEffect(() => {
    if (needsMigration && !hasMigratedRef.current) {
      hasMigratedRef.current = true;
      ensureSyncDoc({ id: doc._id });
    }
  }, [needsMigration, doc._id, ensureSyncDoc]);

  const editor = useEditor(
    {
      extensions: sync.extension ? [...extensions, sync.extension] : extensions,
      content: sync.initialContent ?? undefined,
      editable: effectiveMode !== "viewing",
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            "prose prose-sm dark:prose-invert max-w-none min-h-48 px-4 py-3 outline-hidden focus:outline-hidden",
        },
      },
    },
    [sync.extension ? "ready" : "loading"],
  );

  // Update editable when mode changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(effectiveMode !== "viewing");
    }
  }, [editor, effectiveMode]);

  // Toggle suggestion tracking with the mode. Editing/Viewing apply edits
  // directly; Suggesting converts them into tracked-change marks.
  useEffect(() => {
    if (!editor) return;
    if (isPrRecap) {
      disableSuggesting(editor);
      return;
    }
    if (effectiveMode === "suggesting") enableSuggesting(editor);
    else disableSuggesting(editor);
  }, [editor, effectiveMode, isPrRecap]);

  // Surface the pending-suggestion count so the header toggle can show it.
  const suggestionCount =
    useEditorState({
      editor,
      selector: ({ editor: e }) =>
        e ? collectSuggestions(e.state.doc).length : 0,
    }) ?? 0;
  useEffect(() => {
    onSuggestionCount(suggestionCount);
  }, [suggestionCount, onSuggestionCount]);

  // Keep the outline in sync with live editor content.
  useEffect(() => {
    if (!editor) return;

    const syncTocContent = () => {
      setTocContent(editor.getMarkdown());
    };

    syncTocContent();
    editor.on("update", syncTocContent);
    return () => {
      editor.off("update", syncTocContent);
    };
  }, [editor]);

  /**
   * Snapshot the current document as a version. Shared by the idle timer and
   * the status line's Retry, so a failed snapshot is recoverable without
   * touching the text again.
   */
  const runSaveVersion = () => {
    if (!editor) return;
    setDocSaveState({ status: "saving" });
    saveVersion({
      docId: doc._id,
      content: editor.getMarkdown(),
      pmContent: JSON.stringify(editor.state.doc.toJSON()),
    })
      .then(() => {
        editCountRef.current = 0;
        setDocSaveState({ status: "saved", at: Date.now() });
      })
      .catch(() => setDocSaveState({ status: "error" }));
  };

  // The transaction listener is registered once per editor; the ref lets it
  // reach the current save closure without re-registering on every render.
  const saveVersionRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    saveVersionRef.current = runSaveVersion;
  }, [runSaveVersion]);

  // Version snapshot tracking
  useEffect(() => {
    if (!editor) return;

    const handleTransaction = ({
      transaction,
    }: {
      transaction: Transaction;
    }) => {
      // Only local edits drive version snapshots; ignore remote (collab) steps
      // so another user's edits don't trigger or attribute a version here.
      if (transaction.getMeta("collab$")) return;
      editCountRef.current += 1;
      // Returning `prev` unchanged skips a re-render, so this costs nothing per
      // keystroke once the status line already says "Unsaved version".
      setDocSaveState((prev) =>
        prev.status === "pending" ? prev : { status: "pending" },
      );

      const now = Date.now();
      if (now - lastTouchDraftRef.current > 30_000) {
        lastTouchDraftRef.current = now;
        touchDraft({ docId: doc._id });
      }

      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (editCountRef.current > 0) saveVersionRef.current();
      }, VERSION_IDLE_MS);
    };

    editor.on("update", handleTransaction);
    return () => {
      editor.off("update", handleTransaction);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [editor, doc._id, touchDraft]);

  // Reflect open/active anchors as highlights in the document.
  useEffect(() => {
    if (!editor) return;
    setCommentHighlightState(editor, { openAnchorIds, activeAnchorId });
  }, [editor, openAnchorIds, activeAnchorId]);

  // Track anchors still present in the doc so deleted ones show as orphaned.
  useEffect(() => {
    if (!editor) return;
    const update = () =>
      setPresentAnchorIds(collectPresentAnchorIds(editor.state.doc));
    update();
    editor.on("update", update);
    return () => {
      editor.off("update", update);
    };
  }, [editor]);

  // Highlight click -> focus its thread in the panel.
  useEffect(() => {
    anchorClickRef.current = (anchorId: string) => {
      setActiveAnchorId(anchorId);
      if (!commentsOpen) onToggleComments();
    };
  }, [commentsOpen, onToggleComments]);

  // Panel thread click -> scroll the editor to the anchored text.
  const handleAnchorActivate = (anchorId: string) => {
    setActiveAnchorId(anchorId);
    if (editor) scrollToAnchor(editor, anchorId);
  };

  const handleStartComment = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const text = editor.state.doc.textBetween(from, to, " ");
    const anchorId = nanoid();
    // Anchor the selection immediately so the pending highlight tracks edits.
    applyCommentAnchor(editor, anchorId);
    setComposingAnchorId(anchorId);
    setComposingAnchorText(text);
    setActiveAnchorId(anchorId);
    if (!commentsOpen) onToggleComments();
  };

  const handleCancelCompose = () => {
    if (editor && composingAnchorId)
      removeCommentAnchor(editor, composingAnchorId);
    setComposingAnchorId(null);
    setComposingAnchorText(null);
  };

  const handleCommentCreated = () => {
    setComposingAnchorId(null);
    setComposingAnchorText(null);
  };

  const handleRestoreVersion = async (pmContent: string) => {
    if (!editor) return;
    // Snapshot the current state first so the restore is itself reversible
    // (dedupe in saveVersion makes this free when nothing changed).
    await withMutationToast(
      saveVersion({
        docId: doc._id,
        content: editor.getMarkdown(),
        pmContent: JSON.stringify(editor.state.doc.toJSON()),
      }).then(() => {
        try {
          const json = JSON.parse(pmContent);
          // Apply with skip meta so the restore is not turned into a tracked
          // suggestion while in Suggesting mode.
          setContentUntracked(editor, json);
        } catch {
          // ignore malformed snapshots
        }
        setSelectedVersionId(null);
      }),
      "Version restored",
      "Couldn't restore version",
      "doc-restore-version",
    );
  };

  if (sync.isLoading || (!sync.extension && sync.initialContent === null)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    // `relative`: below `md` the comments / history / suggestions panels are
    // full-width overlays over the editor rather than a 320px column beside it,
    // and they position against this row.
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <div className="flex max-sm:min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
        {/* This tab has no toolbar of its own, so the version state sits top
            right above the editor. It renders nothing until there is something
            to say. */}
        {selectedVersionId ? null : (
          <DocSaveStatus state={docSaveState} onRetry={runSaveVersion} />
        )}
        <AnimatePresence mode="wait" initial={false}>
          {selectedVersionId ? (
            <m.div
              key="diff"
              className="scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              <DocVersionDiff
                versionId={selectedVersionId}
                currentContent={doc.content}
                onRestore={handleRestoreVersion}
              />
            </m.div>
          ) : (
            <m.div
              key="live"
              className="flex min-h-0 flex-1 gap-6 overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              {!commentsOpen &&
                !historyOpen &&
                !suggestionsOpen &&
                tocContent.trim().length > 0 && (
                  <FloatingToc
                    containerRef={contentScrollRef}
                    content={tocContent}
                    className="hidden w-52 shrink-0 border-r border-border py-1 lg:block"
                  />
                )}

              <div
                ref={contentScrollRef}
                className="scrollbar min-h-0 flex-1 overflow-y-auto"
              >
                <EditorContent
                  editor={editor}
                  // Code fences scroll inside themselves; an unbroken line would
                  // otherwise widen the whole document past the viewport.
                  className="[&_.tiptap]:min-h-48 [&_.tiptap]:outline-hidden max-sm:[&_pre]:overflow-x-auto"
                />
                {editor && (
                  <BubbleMenu
                    editor={editor}
                    className="rounded-menu-item bg-popover/95 p-1 backdrop-blur-md smooth-shadow-ring-md"
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs max-sm:h-10 max-sm:px-3"
                      onClick={handleStartComment}
                    >
                      <IconMessage size={14} aria-hidden />
                      Comment
                    </Button>
                  </BubbleMenu>
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {commentsOpen ? (
          <m.div
            key="comments"
            className="flex h-full min-h-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
          >
            <DocCommentsPanel
              docId={doc._id}
              allowAskEva={isPrRecap}
              activeAnchorId={activeAnchorId}
              onAnchorClick={handleAnchorActivate}
              onClose={onToggleComments}
              composingAnchorId={composingAnchorId}
              composingAnchorText={composingAnchorText}
              onCancelCompose={handleCancelCompose}
              onCommentCreated={handleCommentCreated}
              presentAnchorIds={presentAnchorIds}
            />
          </m.div>
        ) : historyOpen ? (
          <m.div
            key="history"
            className="flex h-full min-h-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
          >
            <DocHistoryPanel
              docId={doc._id}
              docKind={doc.kind}
              selectedVersionId={selectedVersionId}
              onSelectVersion={(id) => setSelectedVersionId(id)}
              onClose={onToggleHistory}
            />
          </m.div>
        ) : suggestionsOpen && editor ? (
          <m.div
            key="suggestions"
            className="flex h-full min-h-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
          >
            <DocSuggestionsPanel editor={editor} onClose={onToggleSuggestions} />
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
