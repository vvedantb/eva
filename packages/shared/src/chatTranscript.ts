/**
 * How a chat transcript loads, shared by the web (`useChatTranscript`) and
 * the phone so both read the same, small results from `messages.listByParent`:
 * the newest {@link TRANSCRIPT_TAIL_MESSAGES} first, then live `since` the
 * tail's oldest row, then older history in pages that double. A whole
 * 400-message chat reads about 3.2 MB, so neither client asks for it at once.
 */

/**
 * Messages a chat opens with. 30 covers the last turn (the only one in the
 * viewport on open) and most of the first screen above it, at about a tenth
 * of a heavy chat's payload.
 */
export const TRANSCRIPT_TAIL_MESSAGES = 30;

/** Args of the tail subscription. */
export function transcriptTailArgs<P>(parentId: P) {
  return { parentId, tail: TRANSCRIPT_TAIL_MESSAGES };
}

/**
 * Args of the live subscription the chat follows once its tail resolved:
 * every message from the tail's oldest row on. A tail shorter than a full
 * one already holds the whole chat, so it follows everything (`since: 0`);
 * that also keeps an optimistic row, stamped with the client's clock, from
 * becoming the anchor.
 */
export function transcriptLiveArgs<P>(
  parentId: P,
  tail: ReadonlyArray<{ _creationTime: number }>,
) {
  const oldest = tail[0];
  const since =
    tail.length < TRANSCRIPT_TAIL_MESSAGES || oldest === undefined
      ? 0
      : oldest._creationTime;
  return { parentId, since };
}

/** Older history loads in pages that double, so it re-reads at most 2×. */
export const OLDER_TRANSCRIPT_FIRST_PAGE = 50;
/** After 50, 100, 200 and 400 older rows, the next step loads all of them. */
export const OLDER_TRANSCRIPT_PAGED_STEPS = 4;

/** Args of the older-history query for a step (1 and up) `before` the oldest live row. */
export function olderTranscriptArgs<P>(
  parentId: P,
  before: number,
  steps: number,
): { parentId: P; before: number; tail?: number } {
  if (steps > OLDER_TRANSCRIPT_PAGED_STEPS) return { parentId, before };
  return {
    parentId,
    before,
    tail: OLDER_TRANSCRIPT_FIRST_PAGE * 2 ** (steps - 1),
  };
}
