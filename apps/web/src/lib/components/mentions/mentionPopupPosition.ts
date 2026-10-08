/** Cursor-style mention picker layout (compact width, flip above/below). */

export interface MentionPopupPlacement {
  top: number;
  left: number;
  width: number;
  placement: "above" | "below";
  maxHeight: number;
}

const POPUP_WIDTH = 360;
const POPUP_GAP = 6;
const POPUP_ESTIMATED_HEIGHT = 272;
const VIEWPORT_PADDING = 8;
const LINE_HEIGHT_FALLBACK = 18;
const PANEL_MAX_HEIGHT = 340;
/** Below this the panel would show ~2 rows, so it flips under the composer. */
const PANEL_MIN_ABOVE = 200;

/** Caret rect inside a contentEditable, or a sensible fallback at the editor end. */
export function getSelectionAnchorRect(editor: HTMLElement): DOMRect {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (editor.contains(range.startContainer)) {
      const clientRects = range.getClientRects();
      const lastIndex = clientRects.length - 1;
      if (lastIndex >= 0) {
        const rect = clientRects.item(lastIndex);
        if (rect) return rect;
      }
      const rect = range.getBoundingClientRect();
      if (rect.height > 0 || rect.width > 0) {
        return rect;
      }
      return new DOMRect(rect.left, rect.top, 0, LINE_HEIGHT_FALLBACK);
    }
  }

  const editorRect = editor.getBoundingClientRect();
  return new DOMRect(
    editorRect.left + 8,
    editorRect.bottom - LINE_HEIGHT_FALLBACK,
    0,
    LINE_HEIGHT_FALLBACK,
  );
}

export function computeMentionPopupPlacement(
  anchor: DOMRect,
  estimatedHeight = POPUP_ESTIMATED_HEIGHT,
): MentionPopupPlacement {
  // The visual viewport is what is actually visible: on a phone the on-screen
  // keyboard shrinks it while `window.innerHeight` stays put, so measuring
  // against `innerHeight` would place the list behind the keyboard.
  const visual = window.visualViewport;
  const viewportWidth = visual?.width ?? window.innerWidth;
  const viewportHeight = visual?.height ?? window.innerHeight;

  const width = Math.min(POPUP_WIDTH, viewportWidth - VIEWPORT_PADDING * 2);
  const spaceAbove = anchor.top - VIEWPORT_PADDING;
  const spaceBelow = viewportHeight - anchor.bottom - VIEWPORT_PADDING;
  const placeAbove =
    spaceAbove >= estimatedHeight + POPUP_GAP || spaceAbove >= spaceBelow;
  const placement = placeAbove ? "above" : "below";
  const available =
    (placement === "above" ? spaceAbove : spaceBelow) - POPUP_GAP;
  const maxHeight = Math.max(120, Math.min(estimatedHeight, available));

  let left = anchor.left;
  if (left + width > viewportWidth - VIEWPORT_PADDING) {
    left = viewportWidth - VIEWPORT_PADDING - width;
  }
  left = Math.max(VIEWPORT_PADDING, left);

  const top =
    placement === "above" ? anchor.top - POPUP_GAP : anchor.bottom + POPUP_GAP;

  return { top, left, width, placement, maxHeight };
}

/**
 * Panel layout: a sheet the exact width of the composer, sitting just above it.
 * Anchored to the composer rather than the caret so the list does not jump
 * around mid-word.
 */
export function computePanelPopupPlacement(
  anchor: DOMRect,
): MentionPopupPlacement {
  const visual = window.visualViewport;
  const viewportHeight = visual?.height ?? window.innerHeight;

  const spaceAbove = anchor.top - VIEWPORT_PADDING - POPUP_GAP;
  const spaceBelow =
    viewportHeight - anchor.bottom - VIEWPORT_PADDING - POPUP_GAP;
  const placeAbove = spaceAbove >= PANEL_MIN_ABOVE || spaceAbove >= spaceBelow;
  const placement = placeAbove ? "above" : "below";
  const available = placeAbove ? spaceAbove : spaceBelow;

  return {
    top: placeAbove ? anchor.top - POPUP_GAP : anchor.bottom + POPUP_GAP,
    left: anchor.left,
    width: anchor.width,
    placement,
    maxHeight: Math.max(160, Math.min(PANEL_MAX_HEIGHT, available)),
  };
}
