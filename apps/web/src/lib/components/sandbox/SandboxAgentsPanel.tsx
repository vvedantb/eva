"use client";

import { AgentsPanel } from "@/lib/components/sandbox/AgentsPanel";
import type { SubagentView } from "@/lib/components/sandbox/agentActivity";
import { useStopBackgroundAgent } from "@/lib/components/chat/useStopBackgroundAgent";
import type { ChatEntityRef } from "@/lib/components/chat/sandboxChatSurface";

/** Agents tab for every sandbox surface — same roster, entity's stop mutation. */
export function SandboxAgentsPanel({
  entity,
  agents,
  isReadOnly,
}: {
  entity: ChatEntityRef;
  agents: SubagentView[];
  isReadOnly?: boolean;
}) {
  const { requestStop, stopDialog } = useStopBackgroundAgent(entity);

  return (
    <>
      <AgentsPanel
        agents={agents}
        isReadOnly={isReadOnly}
        onRequestStop={requestStop}
      />
      {stopDialog}
    </>
  );
}
