"use client";

import { api } from "@eva/backend";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useHeldQuery } from "./useHeldQuery";

export type TranscriptParentId = FunctionArgs<
  typeof api.messages.listByParent
>["parentId"];

/** One row of a chat transcript (session chat tab, quick task or project). */
export type TranscriptMessage = FunctionReturnType<
  typeof api.messages.listByParent
>[number];

/**
 * Messages a chat opens with. 30 covers the last turn (the only one in the
 * viewport on open) and most of the first screen above it, at about a tenth
 * of a heavy chat's payload.
 */
const TRANSCRIPT_TAIL_MESSAGES = 30;

/** Args of the tail subscription; `prefetchSession` warms the same key. */
export function transcriptTailArgs(parentId: TranscriptParentId) {
  return { parentId, tail: TRANSCRIPT_TAIL_MESSAGES };
}

/**
 * A chat's transcript, newest messages first to arrive.
 *
 * The full list of a heavy chat is megabytes, and nothing painted until all
 * of it had crossed the wire. The tail is a small, constant-size result, so
 * the chat paints from it; the full list replaces it when it lands. Row ids
 * are the same in both, so mounted rows stay mounted, and `ChatBody` pins its
 * window to a row id, so the swap moves nothing on screen.
 *
 * The full list subscribes only after the tail resolved: two queries sent
 * together would answer together, and the tail would wait for the full list.
 *
 * `"skip"` (hidden session shells) holds only the tail, like `useHeldQuery`.
 * The full list of a heavy chat is megabytes, and holding it for every
 * hidden shell kept it all in memory. On return the tail paints at once and
 * the full list swaps in by row id, as on open.
 */
export function useChatTranscript(parentId: TranscriptParentId | "skip") {
  const skipped = parentId === "skip";
  const tail = useHeldQuery(
    api.messages.listByParent,
    skipped ? "skip" : transcriptTailArgs(parentId),
  );
  const full = useQuery(
    api.messages.listByParent,
    skipped || tail === undefined ? "skip" : { parentId },
  );
  return full ?? tail;
}
