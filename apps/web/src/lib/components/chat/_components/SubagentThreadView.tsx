"use client";

import { useQueries } from "convex/react";
import { IconRobot } from "@tabler/icons-react";
import {
  ActivityTasks,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  Message as AIMessage,
  MessageContent,
} from "@eva/ui";
import { Markdown } from "@eva/ui/markdown";
import { api } from "@eva/backend";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import { RepoSectionBreadcrumb } from "@/lib/components/RepoSectionBreadcrumb";
import { AgentStopButton } from "@/lib/components/sandbox/AgentsPanel";
import {
  subagentTone,
  type SubagentView,
} from "@/lib/components/sandbox/agentActivity";
import {
  buildSubagentThread,
  isEmptySubagentThread,
} from "../subagentThread";

/** A transcript message that holds some of this subagent's steps. */
export interface SubagentSource {
  messageId: string;
  /** The trimmed log from `listByParent`, shown until the full one loads. */
  activityLog: string;
}

/** Longest parent title kept whole; the breadcrumb leaf needs the room. */
const PARENT_TITLE_MAX = 32;

function shortTitle(title: string): string {
  return title.length > PARENT_TITLE_MAX
    ? `${title.slice(0, PARENT_TITLE_MAX - 1).trimEnd()}…`
    : title;
}

/**
 * Untrimmed logs for the messages that hold this subagent's steps. The prompt
 * and its messages ride fields `listByParent` strips, so the view fetches them
 * only while it is open — uncached, so the subscription dies with the view.
 * Keyed by a joined id string so the compiler only rebuilds the query map
 * (and `useQueries` only resubscribes) when the set of messages changes.
 */
function useFullActivityLogs(sources: ReadonlyArray<SubagentSource>): string[] {
  const idsKey = sources.map((source) => source.messageId).join(" ");
  const queries = Object.fromEntries(
    (idsKey ? idsKey.split(" ") : []).map((messageId) => [
      messageId,
      { query: api.messages.activityLogById, args: { messageId } },
    ]),
  );
  const results = useQueries(queries);
  return sources.map((source) => {
    const full = results[source.messageId];
    return typeof full === "string" ? full : source.activityLog;
  });
}

/**
 * A subagent opened as its own read-only thread over the parent chat: the
 * prompt it was given, the tools it ran, what it said, and its result — live
 * while it runs. The breadcrumb's parent title returns to the parent chat.
 */
export function SubagentThreadView({
  agent,
  parentTitle,
  sources,
  liveActivity,
  canStop,
  onRequestStop,
  onClose,
  onOpenFile,
}: {
  agent: SubagentView;
  parentTitle: string;
  sources: ReadonlyArray<SubagentSource>;
  /** The running turn's streaming payload, when it holds this subagent. */
  liveActivity: string | undefined;
  canStop: boolean;
  onRequestStop: (toolUseId: string) => Promise<void>;
  onClose: () => void;
  onOpenFile?: (path: string) => void;
}) {
  const logs = useFullActivityLogs(sources);
  const steps = [...logs, liveActivity].flatMap(
    (log) => parseActivitySteps(log) ?? [],
  );
  const thread = buildSubagentThread(steps, agent.toolUseId, !agent.backgrounded);
  const running = subagentTone(agent.status) === "active";
  const lastBlock = thread.blocks.at(-1);
  // Older runs and non-Claude agents never recorded the prompt or messages.
  const onlyToolCalls =
    !running &&
    thread.prompt === undefined &&
    !thread.blocks.some((block) => block.kind === "text");

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="min-w-0 flex-1">
          <RepoSectionBreadcrumb
            sectionLabel={shortTitle(parentTitle)}
            onSectionClick={onClose}
            entityLabel={agent.title}
          />
        </div>
        <span className="shrink-0 text-xs capitalize text-muted-foreground">
          {agent.status.replaceAll("_", " ")}
        </span>
        {canStop ? (
          <AgentStopButton
            toolUseId={agent.toolUseId}
            onRequestStop={onRequestStop}
          />
        ) : null}
      </div>
      {isEmptySubagentThread(thread) && !running ? (
        <ConversationEmptyState
          icon={<IconRobot className="size-10 text-muted-foreground/60" />}
          title="No recorded activity for this agent."
          description="Transcripts are recorded for agents started from now on."
        />
      ) : (
        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="mx-auto w-full max-w-3xl gap-3 p-3">
            {onlyToolCalls ? (
              <p className="text-sm text-muted-foreground">
                Only tool calls were recorded for this agent.
              </p>
            ) : null}
            {thread.prompt ? (
              <AIMessage from="user">
                <MessageContent className="rounded-surface bg-muted px-3 py-2 text-foreground group-[.is-user]:bg-muted">
                  <Markdown>{thread.prompt}</Markdown>
                </MessageContent>
              </AIMessage>
            ) : null}
            {thread.blocks.map((block, index) => (
              <AIMessage key={index} from="assistant">
                <MessageContent className="px-1 py-2">
                  {block.kind === "text" ? (
                    <Markdown>{block.text}</Markdown>
                  ) : (
                    <ActivityTasks
                      steps={block.steps}
                      isStreaming={running && block === lastBlock}
                      onOpenFile={onOpenFile}
                    />
                  )}
                </MessageContent>
              </AIMessage>
            ))}
            {running && lastBlock?.kind !== "steps" ? (
              <ActivityTasks steps={[]} isStreaming />
            ) : null}
            {thread.result ? (
              <AIMessage from="assistant">
                <MessageContent className="px-1 py-2">
                  <Markdown>{thread.result}</Markdown>
                </MessageContent>
              </AIMessage>
            ) : null}
          </ConversationContent>
        </Conversation>
      )}
    </div>
  );
}
