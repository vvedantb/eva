"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { CenteredSpinner, cn } from "@eva/ui";
import { mutationError } from "@/lib/utils/mutationToast";
import {
  SessionSourceDetail,
  sessionSourceDetailTitleClass,
} from "@/lib/components/sandbox/SessionSourcePane";
import { baseDocEditorExtensions, useDocSync } from "./_utils/useDocSync";

/**
 * Inline editor for a doc opened from the sandbox Documents tab, so notes are
 * written beside the chat. Same live sync as the Documents viewer, without its
 * comments / history / suggestions chrome.
 */
export function SourceDocumentEditor({
  doc,
  onBack,
}: {
  doc: { _id: Id<"docs">; title: string };
  onBack: () => void;
}) {
  return (
    <SessionSourceDetail
      backLabel="Documents"
      onBack={onBack}
      title={<DocTitleInput key={doc._id} id={doc._id} title={doc.title} />}
    >
      <DocBody docId={doc._id} />
    </SessionSourceDetail>
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
      className={cn(
        sessionSourceDetailTitleClass,
        "rounded-md bg-transparent outline-hidden hover:bg-muted focus:bg-muted",
      )}
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
