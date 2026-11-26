"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "@tiptap/markdown";
import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  type CSSProperties,
} from "react";
import { cn } from "@eva/ui";

const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
  }),
  Underline,
  Markdown.configure({
    markedOptions: {
      gfm: true,
    },
  }),
];

export interface MarkdownEditorHandle {
  getMarkdown: () => string;
  focus: () => void;
}

interface MarkdownEditorProps {
  content: string;
  editable: boolean;
  className?: string;
  placeholder?: string;
  minHeight?: string;
  onBlur?: (markdown: string) => void;
  onChange?: (markdown: string) => void;
}

export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor(
  { content, editable, className, placeholder, minHeight, onBlur, onChange },
  ref,
) {
  const prevEditable = useRef(editable);

  const editor = useEditor({
    extensions: EXTENSIONS,
    content,
    contentType: "markdown",
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none",
          "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          "outline-hidden",
          "[&_p]:my-0 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
          minHeight,
        ),
      },
    },
    onBlur: ({ editor: e }) => {
      onBlur?.(e.getMarkdown());
    },
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getMarkdown());
    },
  });

  useImperativeHandle(ref, () => ({
    getMarkdown: () => editor?.getMarkdown() ?? "",
    focus: () => editor?.commands.focus("end"),
  }));

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
    if (!prevEditable.current && editable) {
      editor.commands.focus("end");
    }
    prevEditable.current = editable;
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    const shouldSync = content === "" || !editable;
    if (!shouldSync) return;
    const currentMarkdown = editor.getMarkdown();
    if (currentMarkdown !== content) {
      editor.commands.setContent(content, { contentType: "markdown" });
    }
  }, [editor, content, editable]);

  const placeholderStyle: CSSProperties & Record<`--${string}`, string> = {};
  if (placeholder) placeholderStyle["--placeholder-text"] = `"${placeholder}"`;

  return (
    <EditorContent
      editor={editor}
      style={placeholderStyle}
      className={cn(
        className,
        placeholder &&
          "[&_.tiptap.is-editor-empty:first-child]:before:content-(--placeholder-text) [&_.tiptap.is-editor-empty:first-child]:before:text-muted-foreground [&_.tiptap.is-editor-empty:first-child]:before:pointer-events-none [&_.tiptap.is-editor-empty:first-child]:before:float-left [&_.tiptap.is-editor-empty:first-child]:before:h-0",
      )}
    />
  );
});
