"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useChatTranscript } from "@/lib/hooks/useChatTranscript";
import { api, type BackgroundAgentEntry, type Id } from "@eva/backend";
import { isChatTurnExecuting } from "@/lib/components/chat/chatBodyUtils";
import { useChatTurnStatus } from "@/lib/components/chat/useChatTurnOpen";
import {
  deriveSubagents,
  subagentTone,
  type SubagentView,
} from "./agentActivity";

interface SubagentRoster {
  agents: SubagentView[];
  /** Content key for the Agents tab: it appears once agents exist. */
  hasAgents: boolean;
  hasRunningAgents: boolean;
}

/**
 * Agents-tab roster for the task and project sandbox panels. Sessions fold
 * theirs inside `SandboxPanel` from props the session shell already holds;
 * these two shells never query the chat transcript, so the panel subscribes
 * itself. Its queries are the ones the matching chat panel already runs with
 * the same arguments, so the cached client shares one subscription each.
 */
export function useSubagentRoster({
  parentId,
  streamingEntityId,
  backgroundAgents,
  sandboxRunning,
}: {
  /** The chat; undefined for a task's or project's chat not created yet. */
  parentId: Id<"sessionChats"> | undefined;
  /** `api.streaming.get` entity id for that chat's turn. */
  streamingEntityId: string | undefined;
  backgroundAgents: BackgroundAgentEntry[] | undefined;
  sandboxRunning: boolean;
}): SubagentRoster {
  const messages = useChatTranscript(parentId ?? "skip");
  const streaming = useQuery(
    api.streaming.get,
    streamingEntityId ? { entityId: streamingEntityId } : "skip",
  );
  const status = useChatTurnStatus(parentId);

  // Streaming payloads can outlive their turn; only fold them while one runs.
  // No first-run input: this stream is the chat's, not a quick task's first
  // run, so a running first run must not fold it.
  const isExecuting = isChatTurnExecuting({ status, messages });
  const agents = deriveSubagents({
    activityLogs: (messages ?? []).map((message) => message.activityLog),
    streamingActivity: isExecuting ? streaming?.currentActivity : undefined,
    backgroundAgents,
    sandboxRunning,
  });

  return {
    agents,
    hasAgents: agents.length > 0,
    hasRunningAgents: agents.some(
      (agent) => subagentTone(agent.status) === "active",
    ),
  };
}
