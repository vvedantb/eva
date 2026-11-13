import { api } from "@eva/backend";
import {
  olderTranscriptArgs,
  transcriptLiveArgs,
  transcriptTailArgs,
} from "@eva/shared";
import { useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useState } from "react";

type TranscriptParentId = FunctionArgs<typeof api.messages.listByParent>["parentId"];
type TranscriptMessage = FunctionReturnType<typeof api.messages.listByParent>[number];

/** Older-history state for one chat: how many pages were asked for. */
type OlderState = { parentId: TranscriptParentId | undefined; steps: number };

/**
 * A chat's transcript as the web loads it (`useChatTranscript` and
 * `useOlderTranscript` in apps/web, plan in `@eva/shared`): the newest 30
 * messages first, then live `since` the oldest of them, and older history in
 * pages that double (50, 100, 200, 400, then the rest) when the reader
 * scrolls up (`loadOlder`). Before, the phone read the whole chat at once
 * (about 3.2 MB for 400 messages).
 *
 * `hasOlder` is false until the server says there is history above the
 * loaded rows. A new page keeps the previous older rows painted until it
 * lands, so nothing above the view jumps.
 */
export function useChatTranscript(parentId: TranscriptParentId | undefined) {
  const tail = useQuery(api.messages.listByParent, parentId ? transcriptTailArgs(parentId) : "skip");
  const [liveArgs, setLiveArgs] = useState<ReturnType<typeof transcriptLiveArgs<TranscriptParentId>> | undefined>(
    undefined,
  );
  const ownLiveArgs = parentId && liveArgs?.parentId === parentId ? liveArgs : undefined;
  // Anchored once per chat, during render: re-anchoring on every tail change
  // would slide the window this exists to pin.
  if (parentId && tail !== undefined && ownLiveArgs === undefined) {
    setLiveArgs(transcriptLiveArgs(parentId, tail));
  }
  const live = useQuery(api.messages.listByParent, ownLiveArgs ?? "skip");
  const rows = live ?? tail;

  const [older, setOlder] = useState<OlderState>({ parentId: undefined, steps: 0 });
  const steps = older.parentId === parentId ? older.steps : 0;
  const before = rows?.[0]?._creationTime;
  const olderArgs = parentId && before !== undefined && steps > 0 ? olderTranscriptArgs(parentId, before, steps) : "skip";
  const loaded = useQuery(api.messages.listByParent, olderArgs);
  // Held across a step change (the new page's query starts empty), and dropped for another chat.
  const [held, setHeld] = useState<{ parentId: TranscriptParentId | undefined; rows: TranscriptMessage[] | undefined }>({
    parentId: undefined,
    rows: undefined,
  });
  if (loaded !== undefined && (held.rows !== loaded || held.parentId !== parentId)) {
    setHeld({ parentId, rows: loaded });
  }
  const heldOlder = held.parentId === parentId ? held.rows : undefined;

  // Before any page, one row read says whether there is history at all.
  const probe = useQuery(
    api.messages.hasMessagesBefore,
    parentId && before !== undefined && steps === 0 ? { parentId, before } : "skip",
  );
  const requested = olderArgs === "skip" ? 0 : (olderArgs.tail ?? Number.POSITIVE_INFINITY);
  const exhausted = loaded !== undefined && loaded.length < requested;
  const hasOlder = steps === 0 ? probe === true : !exhausted;
  const isLoadingOlder = olderArgs !== "skip" && loaded === undefined;

  // A held page from an earlier anchor may reach into the live rows.
  const olderRows =
    heldOlder === undefined || before === undefined ? [] : heldOlder.filter((message) => message._creationTime < before);
  const messages = rows === undefined ? undefined : olderRows.length > 0 ? [...olderRows, ...rows] : rows;

  return {
    messages,
    hasOlder,
    isLoadingOlder,
    /** The next, doubled page of history above; a no-op while one loads or when none is left. */
    loadOlder: () => {
      if (!parentId || !hasOlder || isLoadingOlder) return;
      setOlder({ parentId, steps: steps + 1 });
    },
  };
}
