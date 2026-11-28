/** Where an annotation points; stored on its chat row as `annotation`. */
export interface PreviewAnnotationRef {
  pagePath: string;
  element: string;
}

/** The full ref a new annotation is sent with; the backfill has no selector. */
export interface PreviewAnnotation extends PreviewAnnotationRef {
  selector?: string;
}

const SUFFIX_RE = /\n\n\[Annotated (<[^>\n]+>) on ([^\n]+)\]$/;

/** Compact chat-display text for an annotation submission. */
export function buildAnnotationDisplay(
  feedback: string,
  ref: PreviewAnnotationRef,
): string {
  return `${feedback.trim()}\n\n[Annotated ${ref.element} on ${ref.pagePath}]`;
}

/** Reads `buildAnnotationDisplay` output back; null for any other text. */
export function parseAnnotationDisplay(
  content: string,
): (PreviewAnnotationRef & { feedback: string }) | null {
  const match = SUFFIX_RE.exec(content);
  if (!match) return null;
  const [, element, pagePath] = match;
  if (!element || !pagePath) return null;
  const feedback = content.slice(0, match.index).trim();
  if (!feedback) return null;
  return { feedback, element, pagePath };
}
