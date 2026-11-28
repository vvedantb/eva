"use client";

import { api } from "@eva/backend";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import {
  useSandboxChatTranscript,
  type SandboxChatBinding,
} from "@/lib/components/chat/sandboxChatBinding";
import { sandboxChatKeys } from "@/lib/components/chat/sandboxChatTurn";
import {
  deriveSubagents,
  subagentTone,
  type SubagentView,
} from "./agentActivity";

interface SubagentRoster {
  agents: SubagentView[];
  hasAgents: boolean;
  hasRunningAgents: boolean;
}

/**
 * Agents-tab roster of a sandbox rail, folded from its chat. Its queries are
 * the ones the matching chat panel already runs with the same arguments, so
 * the cached client shares one subscription each.
 */
export function useSubagentRoster({
  binding,
  sandboxRunning,
}: {
  binding: SandboxChatBinding;
  sandboxRunning: boolean;
}): SubagentRoster {
  const { messages, isExecuting } = useSandboxChatTranscript(binding);
  const { streamingEntityId } = sandboxChatKeys(binding.entity);
  const streaming = useHeldQuery(
    api.streaming.get,
    binding.active && streamingEntityId
      ? { entityId: streamingEntityId }
      : "skip",
  );

  const agents = deriveSubagents({
    activityLogs: (messages ?? []).map((message) => message.activityLog),
    streamingActivity: isExecuting ? streaming?.currentActivity : undefined,
    backgroundAgents: binding.doc?.backgroundAgents,
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
