"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { AgentMedia } from "@/lib/components/AgentMedia";

/**
 * Screenshots and recordings a task run captured, shown under its timeline row.
 *
 * The run is where the ids live — a run writes no chat message — so every
 * surface that shows a run reads them from here. The quick task's first run is
 * the exception: it renders as a chat turn and carries its media on that
 * message instead (see `firstRunChatTurn.ts`).
 */
export function RunMedia({
  runId,
  hasMedia,
}: {
  runId: Id<"agentRuns">;
  /** From the run doc, so a run without captures costs no extra query. */
  hasMedia: boolean;
}) {
  const media = useQuery(
    api.agentRuns.getMedia,
    hasMedia ? { id: runId } : "skip",
  );
  if (!media || media.length === 0) return null;
  return <AgentMedia entries={media} />;
}
