const CITE_SOURCE_ATTR = "data-assistant-cite-source";

function elementOf(node: Node | null): HTMLElement | null {
  if (!node) return null;
  return node instanceof HTMLElement ? node : node.parentElement;
}

function closestCiteSource(node: Node | null): HTMLElement | null {
  return elementOf(node)?.closest(`[${CITE_SOURCE_ATTR}]`) ?? null;
}

function selectionIsInEditable(node: Node | null): boolean {
  const element = elementOf(node);
  if (!element) return false;
  return element.closest("textarea, input, [contenteditable='true']") !== null;
}

/**
 * Reads the current document selection if both ends sit in the same
 * assistant reply marked with `data-assistant-cite-source`.
 */
export function captureAssistantCitationSelection(
  selection: Selection | null,
): { messageId: string; text: string } | null {
  if (!selection || selection.isCollapsed) return null;
  if (selection.rangeCount === 0) return null;
  if (
    selectionIsInEditable(selection.anchorNode) ||
    selectionIsInEditable(selection.focusNode)
  ) {
    return null;
  }
  const start = closestCiteSource(selection.anchorNode);
  const end = closestCiteSource(selection.focusNode);
  if (!start || !end || start !== end) return null;
  const messageId = start.getAttribute(CITE_SOURCE_ATTR);
  if (!messageId) return null;
  const text = selection.toString();
  return { messageId, text };
}

export function citationSelectionPosition(
  selection: Selection | null,
): { x: number; y: number } | null {
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();
  const rect = rects.item(rects.length - 1) ?? range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top };
}
