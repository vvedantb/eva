import { tokenizedToEditable } from "./mentionText";
import { stripReviewCommentBlocks } from "./reviewCommentBlocks";

/**
 * The queue panel above a sandbox chat's composer (messages sent while Eva is
 * busy, waiting to run after the current turn), on the web and the phone.
 */

/** The panel's heading when nothing but a running turn holds the queue. */
export const QUEUE_PANEL_LABEL = "Queued";

/**
 * The panel's heading: why the queued messages have not sent. Undefined while
 * a turn runs (the usual reason) or with nothing queued: then the plain
 * {@link QUEUE_PANEL_LABEL}.
 */
export function queuePanelLabel({
  isExecuting,
  queuedCount,
  isSandboxActive,
  heldResetIn,
}: {
  isExecuting: boolean;
  queuedCount: number;
  isSandboxActive: boolean;
  /** Time left on a usage limit that holds queued messages ("2h 28m"); undefined when none is held. */
  heldResetIn?: string;
}): string | undefined {
  if (isExecuting || queuedCount === 0) return undefined;
  if (heldResetIn !== undefined)
    return `${QUEUE_PANEL_LABEL} · sends in ${heldResetIn}`;
  if (!isSandboxActive) return `${QUEUE_PANEL_LABEL} · sends when Eva wakes up`;
  return undefined;
}

/**
 * A queued row's text: mention and skill tokens as their labels, and review
 * comment blocks dropped and counted ("Fix these · 2 review comments").
 * Pass the row's `displayContent ?? content`.
 */
export function queuedMessagePreview(content: string): string {
  const stripped = stripReviewCommentBlocks(content);
  const display = tokenizedToEditable(stripped.text).displayText;
  const count = stripped.reviewCommentCount;
  return count > 0
    ? `${display} · ${count} review comment${count === 1 ? "" : "s"}`
    : display;
}

/**
 * The queue order with `id` moved to `toIndex` (clamped), the others keeping
 * their order: a drag, Move to front (`0`), or one step up or down.
 */
export function moveQueuedId<T>(
  ids: readonly T[],
  id: T,
  toIndex: number,
): T[] {
  const rest = ids.filter((entry) => entry !== id);
  if (rest.length === ids.length) return [...ids];
  const at = Math.max(0, Math.min(toIndex, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** Loaded queue rows in `orderedIds` order (a reorder's optimistic list); ids not loaded drop out. */
export function orderQueuedRows<Row extends { _id: string }>(
  rows: readonly Row[],
  orderedIds: readonly string[],
): Row[] {
  const byId = new Map<string, Row>(rows.map((row) => [row._id, row]));
  return orderedIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}
