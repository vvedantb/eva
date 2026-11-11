"use client";

import { useState } from "react";
import { api } from "@eva/backend";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useHeldResult } from "@vvedantb/ui";
import { useLinkedMessageId } from "@/lib/components/chat/messageLink";
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
 * Args of the live subscription the chat follows once its tail resolved:
 * every message from the tail's oldest row on. A tail shorter than a full
 * one already holds the whole chat, so it follows everything (`since: 0`);
 * that also keeps an optimistic row, stamped with the client's clock, from
 * becoming the anchor.
 */
export function transcriptLiveArgs(
  parentId: TranscriptParentId,
  tail: ReadonlyArray<Pick<TranscriptMessage, "_creationTime">>,
) {
  const oldest = tail[0];
  const since =
    tail.length < TRANSCRIPT_TAIL_MESSAGES || oldest === undefined
      ? 0
      : oldest._creationTime;
  return { parentId, since };
}

/**
 * The newest part of a chat's transcript, kept live.
 *
 * The chat paints from the tail: a small, constant-size result. It then
 * follows `since` the tail's oldest row, which grows as messages arrive but
 * never slides, so rows never drop off its top and older history
 * (`useOlderTranscript`) joins it without a gap. Row ids are the same in
 * both, so the swap moves nothing on screen.
 *
 * The live query subscribes only after the tail resolved: its args come from
 * the tail, and two queries sent together would answer together.
 *
 * `"skip"` (hidden session shells) holds only the tail, like `useHeldQuery`:
 * holding every hidden shell's longer rows kept them all in memory. On
 * return the tail paints at once and the live rows swap in by row id.
 */
export function useChatTranscript(parentId: TranscriptParentId | "skip") {
  const skipped = parentId === "skip";
  const tail = useHeldQuery(
    api.messages.listByParent,
    skipped ? "skip" : transcriptTailArgs(parentId),
  );
  const [liveArgs, setLiveArgs] = useState<
    ReturnType<typeof transcriptLiveArgs> | undefined
  >(undefined);
  const ownArgs =
    !skipped && liveArgs?.parentId === parentId ? liveArgs : undefined;
  // Anchored once per chat, during render: re-anchoring on every tail change
  // would slide the window this exists to pin.
  if (!skipped && tail !== undefined && ownArgs === undefined) {
    setLiveArgs(transcriptLiveArgs(parentId, tail));
  }
  const live = useQuery(api.messages.listByParent, ownArgs ?? "skip");
  return live ?? tail;
}

/** Older history loads in pages that double, so it re-reads at most 2×. */
const OLDER_FIRST_PAGE = 50;
/** After 50, 100, 200 and 400 older rows, the next step loads all of them. */
const OLDER_PAGED_STEPS = 4;

/** What a chat needs loaded: one row, or the whole chat (find, fork). */
export type TranscriptReach = { messageId: string } | "all";

interface OlderState {
  parentId: TranscriptParentId | undefined;
  /** 0: none loaded yet. Past `OLDER_PAGED_STEPS`: everything. */
  steps: number;
  reach: TranscriptReach | undefined;
}

function olderArgs(
  parentId: TranscriptParentId,
  before: number,
  steps: number,
): { parentId: TranscriptParentId; before: number; tail?: number } {
  if (steps > OLDER_PAGED_STEPS) return { parentId, before };
  return { parentId, before, tail: OLDER_FIRST_PAGE * 2 ** (steps - 1) };
}

function reachSatisfied(
  reach: TranscriptReach,
  messages: ReadonlyArray<Pick<TranscriptMessage, "_id">>,
): boolean {
  return (
    reach !== "all" &&
    messages.some((message) => message._id === reach.messageId)
  );
}

/**
 * History above a chat's live rows, loaded only when the reader goes there:
 * scrolling up (`loadOlder`), a jump-rail tick or the find bar (`reach`), or a
 * shared message link (`?message=`, read here so the open chat loads down to
 * it).
 *
 * One query, `before` the oldest live row, whose size doubles per step. Its
 * args are fixed per step, so it caches and holds like any other query, and a
 * new step keeps the previous rows painted until it lands.
 *
 * `hasOlder` is false until the server says there is history above.
 * `loadOlder` and `reach` only set state, so they keep their identity across
 * renders: ChatBody hands them to memoised rows.
 */
export function useOlderTranscript({
  parentId,
  live,
  active,
}: {
  parentId: TranscriptParentId | "skip";
  /** `useChatTranscript`'s rows. */
  live: TranscriptMessage[] | undefined;
  /** The chat is on screen: only it follows a shared message link. */
  active: boolean;
}) {
  const skipped = parentId === "skip";
  const [state, setState] = useState<OlderState>({
    parentId: undefined,
    steps: 0,
    reach: undefined,
  });
  if (!skipped && state.parentId !== parentId) {
    setState({ parentId, steps: 0, reach: undefined });
  }
  const own =
    skipped || state.parentId === parentId
      ? state
      : { parentId, steps: 0, reach: undefined };

  const before = live?.[0]?._creationTime;
  const args =
    skipped || before === undefined || own.steps === 0
      ? "skip"
      : olderArgs(parentId, before, own.steps);
  const loaded = useQuery(api.messages.listByParent, args);
  // Held across step changes, so a new step keeps the rows painted. Dropped
  // while hidden, like the live rows (`useChatTranscript`): the steps are
  // kept, so the rows load again on return.
  const heldOlder = useHeldResult(loaded, skipped ? null : parentId);
  const older = skipped ? undefined : heldOlder;
  // Before any step, one row read says whether there is history at all. A
  // quick task shows its first run only once nothing older is left.
  const probeArgs =
    skipped || before === undefined || own.steps > 0
      ? "skip"
      : { parentId, before };
  const probe = useHeldQuery(api.messages.hasMessagesBefore, probeArgs);
  const requested =
    args === "skip" ? 0 : (args.tail ?? Number.POSITIVE_INFINITY);
  const exhausted = loaded !== undefined && loaded.length < requested;
  const hasOlder = own.steps === 0 ? probe === true : !exhausted;
  const isLoading =
    (args !== "skip" && loaded === undefined) ||
    (probeArgs !== "skip" && probe === undefined);

  // A held page from an earlier anchor may reach into the live rows.
  const olderRows =
    older === undefined || before === undefined
      ? []
      : older.filter((message) => message._creationTime < before);
  const messages =
    live === undefined
      ? undefined
      : olderRows.length > 0
        ? [...olderRows, ...live]
        : live;

  // Load the next step while a target is still missing. One step per landed
  // result: the step only moves while nothing is loading.
  const linkedId = useLinkedMessageId();
  const linkedReach: TranscriptReach | undefined =
    active && linkedId !== null ? { messageId: linkedId } : undefined;
  const reach = own.reach ?? linkedReach;
  if (!skipped && reach !== undefined && messages !== undefined && !isLoading) {
    const done = !hasOlder || reachSatisfied(reach, messages);
    if (done) {
      if (own.reach !== undefined) setState({ ...own, reach: undefined });
    } else {
      setState({
        ...own,
        steps: reach === "all" ? OLDER_PAGED_STEPS + 1 : own.steps + 1,
      });
    }
  }

  const loadOlder = () => {
    setState((current) => ({ ...current, steps: current.steps + 1 }));
  };
  const reachHistory = (target: TranscriptReach) => {
    setState((current) => ({ ...current, reach: target }));
  };

  return { messages, hasOlder, isLoading, loadOlder, reach: reachHistory };
}
