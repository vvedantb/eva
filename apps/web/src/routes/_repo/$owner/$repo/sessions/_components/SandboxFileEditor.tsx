"use client";

import type { KeyboardEvent } from "react";
import type { EditorOptions, EditorType } from "@pierre/diffs/edit";
import type {
  FileEditChangeHandler,
  FileEditCompleteHandler,
} from "@pierre/diffs/react";
import { Editor } from "@pierre/diffs/edit";
import { EditProvider, File, useStableCallback } from "@pierre/diffs/react";
import {
  sandboxFileOptions,
  type SandboxFileSurfaceProps,
} from "./SandboxFileCode";

interface SandboxFileEditorProps extends SandboxFileSurfaceProps {
  onDraftChange: (contents: string) => void;
  onSaveShortcut: () => void;
}

function createEditor<EType extends EditorType>(
  editorType: EType,
  options: EditorOptions<EType, undefined, undefined>,
  editStateKey?: string,
): Editor<EType, undefined, undefined> {
  return new Editor(editorType, options, editStateKey);
}

/**
 * Editable file surface, lazily imported so `@pierre/diffs/edit` (a whole text
 * editor) is only downloaded once somebody presses Edit.
 *
 * The draft lives in the panel, not here: Save has to read it, and the panel
 * owns the dirty state the header renders. Nothing is fed back into `File`
 * while the session is live — doing so would fight the editor's own document.
 */
export function SandboxFileEditor({
  name,
  contents,
  cacheKey,
  wrap,
  resolvedTheme,
  onDraftChange,
  onSaveShortcut,
}: SandboxFileEditorProps) {
  const handleEditChange = useStableCallback<
    FileEditChangeHandler<undefined, undefined>
  >((event) => {
    onDraftChange(event.file.contents);
  });

  const handleEditComplete = useStableCallback<
    FileEditCompleteHandler<undefined, undefined>
  >(() => "reject");

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!event.metaKey && !event.ctrlKey) return;
    if (event.key.toLowerCase() !== "s") return;
    event.preventDefault();
    event.stopPropagation();
    onSaveShortcut();
  };

  return (
    <div className="min-h-full" onKeyDownCapture={handleKeyDown}>
      <EditProvider createEditor={createEditor}>
        <File
          edit
          file={{ name, contents, cacheKey }}
          options={sandboxFileOptions({ wrap, resolvedTheme })}
          onEditChange={handleEditChange}
          onEditComplete={handleEditComplete}
          className="min-h-full text-xs"
        />
      </EditProvider>
    </div>
  );
}
