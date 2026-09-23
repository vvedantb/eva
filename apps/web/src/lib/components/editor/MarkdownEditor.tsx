"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { useEffect } from "react";

const markdownExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
  }),
  Markdown.configure({
    markedOptions: {
      gfm: true,
    },
  }),
];

function getMarkdownFromEditor(editor: Editor): string {
  return editor.getMarkdown();
}

interface MarkdownEditorProps {
  initialMarkdown: string;
  onEditorReady: (getMarkdown: () => string | null) => void;
}

export function MarkdownEditor({
  initialMarkdown,
  onEditorReady,
}: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: markdownExtensions,
    content: initialMarkdown,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-48 px-3 py-2 outline-hidden focus:outline-hidden",
      },
    },
  });

  useEffect(() => {
    onEditorReady(() => {
      if (!editor) return null;
      return getMarkdownFromEditor(editor);
    });
  }, [editor, onEditorReady]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar min-h-0 flex-1 overflow-y-auto rounded-control border border-border bg-muted/40">
        <EditorContent
          editor={editor}
          className="[&_.tiptap]:min-h-48 [&_.tiptap]:outline-hidden"
        />
      </div>
    </div>
  );
}
