"use client";

import type { ReactNode } from "react";
import { useQueryState } from "nuqs";
import { cn, OpenSubagentContext } from "@eva/ui";
import { subagentParser } from "@/lib/search-params";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import {
  deriveSubagents,
  subagentTone,
} from "@/lib/components/sandbox/agentActivity";
import {
  isAssistantTurnInProgress,
  type ChatBodyMessage,
} from "./chatBodyUtils";
import type { SandboxChatSurface } from "./sandboxChatSurface";
import { useStopBackgroundAgent } from "./useStopBackgroundAgent";
import {
  SubagentThreadView,
  type SubagentSource,
} from "./_components/SubagentThreadView";

/**
 * Wraps a sandbox chat (session, quick task, project) so any of its subagents
 * can open as a child thread over it (`?subagent=<toolUseId>`). Subtask rows in
 * the timeline and the background agents chip open it through
 * `OpenSubagentContext`.
 *
 * The chat stays mounted underneath — hidden and inert — so its scroll place,
 * draft and subscriptions survive the round trip. An id this chat does not
 * know is ignored, so a stale link just shows the parent chat.
 */
export function SubagentThreadLayer({
  surface,
  parentTitle,
  messages,
  streamingActivity,
  sandboxRunning,
  onOpenFile,
  children,
}: {
  surface: SandboxChatSurface;
  parentTitle: string;
  messages: ReadonlyArray<ChatBodyMessage>;
  streamingActivity: string | undefined;
  sandboxRunning: boolean;
  onOpenFile?: (path: string) => void;
  children: ReactNode;
}) {
  const [subagentId, setSubagentId] = useQueryState("subagent", subagentParser);
  const simpleView = useSimpleView();
  const requestStop = useStopBackgroundAgent(surface.entity);

  // Only the messages that mention this agent are parsed — a plain substring
  // test on the id keeps a long transcript from being parsed on every tick.
  const sources: SubagentSource[] = [];
  let liveActivity: string | undefined;
  if (subagentId) {
    // Streaming payloads can outlive their turn; only read one while it runs.
    if (
      isAssistantTurnInProgress(messages) &&
      streamingActivity?.includes(subagentId)
    ) {
      liveActivity = streamingActivity;
    }
    // The live payload already holds the running turn's steps; reading that
    // message's stored log too would repeat them in the thread.
    const runningMessageId = liveActivity
      ? messages.filter((message) => !message.isSystemAlert).at(-1)?._id
      : undefined;
    for (const message of messages) {
      if (message._id === runningMessageId) continue;
      if (message.activityLog?.includes(subagentId)) {
        sources.push({
          messageId: message._id,
          activityLog: message.activityLog,
        });
      }
    }
  }
  const agent = subagentId
    ? deriveSubagents({
        activityLogs: sources.map((source) => source.activityLog),
        streamingActivity: liveActivity,
        backgroundAgents: surface.backgroundAgents?.filter(
          (entry) => entry.toolUseId === subagentId,
        ),
        sandboxRunning,
      }).find((candidate) => candidate.toolUseId === subagentId)
    : undefined;
  const isOpen = agent !== undefined;

  const openSubagent = simpleView
    ? undefined
    : (toolUseId: string) => void setSubagentId(toolUseId);

  return (
    <OpenSubagentContext value={openSubagent}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* aria-hidden as well as inert: `isComposerVisible` reads it, so
            type-to-focus cannot write keystrokes into the hidden draft. */}
        <div
          inert={isOpen}
          aria-hidden={isOpen || undefined}
          className={cn("flex min-h-0 flex-1 flex-col", isOpen && "invisible")}
        >
          {children}
        </div>
        {agent ? (
          <SubagentThreadView
            agent={agent}
            parentTitle={parentTitle}
            sources={sources}
            liveActivity={liveActivity}
            // Same rule as the Agents tab: only a backgrounded run can be
            // stopped on its own.
            canStop={
              subagentTone(agent.status) === "active" &&
              agent.backgrounded &&
              !surface.isReadOnly
            }
            onRequestStop={requestStop}
            // Replace, so Back from the parent does not reopen the thread.
            onClose={() => void setSubagentId(null, { history: "replace" })}
            onOpenFile={onOpenFile}
          />
        ) : null}
      </div>
    </OpenSubagentContext>
  );
}
