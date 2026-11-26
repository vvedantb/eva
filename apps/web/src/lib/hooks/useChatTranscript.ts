"use client";

import { useState } from "react";
import { api } from "@eva/backend";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useHeldResult } from "@vvedantb/ui";
import {
  olderTranscriptArgs,
  transcriptLiveArgs,
  transcriptTailArgs,
} from "@eva/shared";
import { useLinkedMessageId } from "@/lib/components/chat/messageLink";
import { useHeldQuery } from "./useHeldQuery";

export type TranscriptParentId = FunctionArgs<
  typeof api.messages.listByParent
>["parentId"];

/** One row of a chat transcript (session chat tab, quick task or project). */
export type TranscriptMessage = FunctionReturnType<
  typeof api.messages.listByParent
>[number];

export { transcriptLiveArgs, transcriptTailArgs };

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
    ReturnType<typeof transcriptLiveArgs<TranscriptParentId>> | undefined
  >(undefined);
  const ownArgs =
    !skipped && liveArgs?.parentId === parentId ? liveArgs : undefined;
  if (!skipped && tail !== undefined && ownArgs === undefined) {
    setLiveArgs(transcriptLiveArgs(parentId, tail));
  }
  const live = useQuery(api.messages.listByParent, ownArgs ?? "skip");
  return live ?? tail;
}

/**
 * What a chat needs loaded: one row (a rail tick, a link), or the oldest
 * older row matching a find query (`searchOlderByParent`).
 */
export type TranscriptReach = { messageId: string } | { search: string };

interface OlderState {
  parentId: TranscriptParentId | undefined;
  steps: number;
  reach: TranscriptReach | undefined;
}

/**
 * History above a chat's live rows, loaded only when the reader goes there:
 * scrolling up (`loadOlder`), a jump-rail tick or a find query (`reach`), or a
 * shared message link (`?message=`, read here so the open chat loads down to
 * it).
 *
 * One query, `before` the oldest live row, whose size doubles per step. Its
 * args are fixed per step, so it caches and holds like any other query, and a
 * new step keeps the previous rows painted until it lands.
 *
 * `hasOlder` is false until the server says there is history above.
 * `isReaching` is true until a `reach` target is loaded or out of range.
 * `loadOlder` and `reach` only set state, so they keep their identity across
 * renders: ChatBody hands them to memoised rows.
 */
export function useOlderTranscript({
  parentId,
  live,
  active,
}: {
  parentId: TranscriptParentId | "skip";
  live: TranscriptMessage[] | undefined;
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
      : olderTranscriptArgs(parentId, before, own.steps);
  const loaded = useQuery(api.messages.listByParent, args);
  const heldOlder = useHeldResult(loaded, skipped ? null : parentId);
  const older = skipped ? undefined : heldOlder;
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

  const firstLoaded = messages?.[0]?._creationTime;
  const searchArgs =
    !skipped &&
    hasOlder &&
    own.reach !== undefined &&
    "search" in own.reach &&
    firstLoaded !== undefined
      ? { parentId, query: own.reach.search, before: firstLoaded }
      : "skip";
  const searchHit = useQuery(api.messages.searchOlderByParent, searchArgs);

  const linkedId = useLinkedMessageId();
  const linkedReach: TranscriptReach | undefined =
    active && linkedId !== null ? { messageId: linkedId } : undefined;
  const reach = own.reach ?? linkedReach;
  if (!skipped && reach !== undefined && messages !== undefined && !isLoading) {
    const clear = () => {
      if (own.reach !== undefined) setState({ ...own, reach: undefined });
    };
    if (!hasOlder) {
      clear();
    } else if ("search" in reach) {
      if (searchHit === null) clear();
      else if (searchHit !== undefined) {
        setState({ ...own, reach: { messageId: searchHit } });
      }
    } else if (messages.some((message) => message._id === reach.messageId)) {
      clear();
    } else {
      setState({ ...own, steps: own.steps + 1 });
    }
  }

  const loadOlder = () => {
    setState((current) => ({ ...current, steps: current.steps + 1 }));
  };
  const reachHistory = (target: TranscriptReach) => {
    setState((current) => ({ ...current, reach: target }));
  };

  return {
    messages,
    hasOlder,
    isLoading,
    isReaching: own.reach !== undefined,
    loadOlder,
    reach: reachHistory,
  };
}
