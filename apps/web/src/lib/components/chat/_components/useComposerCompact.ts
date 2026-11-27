import { useRef, type RefObject } from "react";
import { isEditorValueEmpty } from "@/lib/components/mentions";
import {
  draftExceedsPillWidth,
  editorOverflowsHorizontally,
  isComposerCompact,
  readEditorInnerWidth,
} from "@/lib/components/chat/_components/composerCompact";

/**
 * Pill-vs-stacked decision for the composer chrome, measured off the committed
 * DOM: the pill's inner width is cached while the pill is on screen, and a
 * draft that no longer fits it opens the stacked composer.
 *
 * This is deliberately impure — it reads layout during render so the chrome
 * snaps in the same paint as the keystroke — so it opts out of React Compiler
 * on its own. It lives in its own module for exactly that reason: the opt-out
 * stays scoped to these few lines instead of costing `ComposerInputChrome`
 * (and everything it renders) its memoization. The hook still runs on every
 * render of the caller, so the caller compiles and behaves identically.
 */
export function useComposerCompact({
  value,
  fileCount,
}: {
  value: string;
  fileCount: number;
}): { chromeRef: RefObject<HTMLDivElement | null>; compact: boolean } {
  "use no memo";
  const chromeRef = useRef<HTMLDivElement>(null);
  const pillWidthRef = useRef(0);
  const wasCompactRef = useRef(true);

  // An empty draft or attached files settle the layout without measuring, so
  // skip the DOM reads then: read mid-render they force a synchronous layout
  // of the whole page, ~100 ms when a session switch reveals a long chat.
  // The pill width is still cached on the first keystroke's render.
  const needsMeasure = fileCount === 0 && !isEditorValueEmpty(value);
  const editorNode = needsMeasure
    ? chromeRef.current?.querySelector("[data-slot=input-group-control]")
    : null;
  const editor = editorNode instanceof HTMLElement ? editorNode : null;
  if (editor && wasCompactRef.current) {
    const inner = readEditorInnerWidth(editor);
    if (inner > 0) pillWidthRef.current = inner;
  }
  const exceedsPill =
    editor !== null &&
    ((wasCompactRef.current && editorOverflowsHorizontally(editor)) ||
      draftExceedsPillWidth(
        value,
        pillWidthRef.current,
        getComputedStyle(editor).font,
      ));
  const compact = isComposerCompact({ value, fileCount, exceedsPill });
  wasCompactRef.current = compact;

  return { chromeRef, compact };
}
