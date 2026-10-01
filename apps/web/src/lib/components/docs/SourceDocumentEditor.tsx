"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { CenteredSpinner } from "@eva/ui";
import { IconChevronLeft } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { mutationError } from "@/lib/utils/mutationToast";
import { sessionSourceViewAllClass } from "@/lib/components/sandbox/SessionSourcePane";
import { baseDocEditorExtensions, useDocSync } from "./_utils/useDocSync";

/**
 * Inline editor for a doc opened from the sandbox Documents tab, so notes are
 * written beside the chat. Same live sync as the Documents viewer, without its
 * comments / history / suggestions chrome.
 */
export function SourceDocumentEditor({
  numId,
  onBack,
}: {
  numId: number;
  onBack: () => void;
}) {
  const { repoId } = useRepo();
  const doc = useQuery(api.docs.getByNumId, { repoId, numId });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to documents"
          title="Back to documents"
          className={sessionSourceViewAllClass}
        >
          <IconChevronLeft size={14} />
          Documents
        </button>
        {doc ? (
          <DocTitleInput key={doc._id} id={doc._id} title={doc.title} />
        ) : null}
      </div>
      {doc === undefined ? (
        <CenteredSpinner label="Loading" />
      ) : doc === null ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          This document was deleted.
        </p>
      ) : (
        <DocBody docId={doc._id} />
      )}
    </div>
  );
}

/** Uncontrolled so typing never fights the live query; saves on blur. */
function DocTitleInput({ id, title }: { id: Id<"docs">; title: string }) {
  const updateDoc = useMutation(api.docs.update);

  const save = (value: string) => {
    const next = value.trim();
    if (!next || next === title) return;
    updateDoc({ id, title: next }).catch(() =>
      mutationError("Couldn't rename document", "doc-rename"),
    );
  };

  return (
    <input
      defaultValue={title}
      aria-label="Document title"
      className="min-w-0 flex-1 truncate rounded-md bg-transparent px-1.5 py-1 text-[13px] font-medium tracking-[-0.01em] text-foreground outline-hidden hover:bg-muted focus:bg-muted"
      onBlur={(event) => save(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function DocBody({ docId }: { docId: Id<"docs"> }) {
  "use no memo";
  const { sync, isLoading } = useDocSync(docId);
  const editor = useEditor(
    {
      extensions: sync.extension
        ? [...baseDocEditorExtensions, sync.extension]
        : baseDocEditorExtensions,
      content: sync.initialContent ?? undefined,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            "prose prose-sm dark:prose-invert max-w-none min-h-full px-4 py-3 outline-hidden focus:outline-hidden",
        },
      },
    },
    [sync.extension ? "ready" : "loading"],
  );

  if (isLoading) return <CenteredSpinner label="Loading" />;

  return (
    <div
      className="scrollbar min-h-0 flex-1 cursor-text overflow-y-auto"
      onClick={() => editor?.commands.focus()}
    >
      <EditorContent
        editor={editor}
        className="h-full [&_.tiptap]:min-h-full [&_.tiptap]:outline-hidden [&_pre]:overflow-x-auto"
      />
    </div>
  );
}
