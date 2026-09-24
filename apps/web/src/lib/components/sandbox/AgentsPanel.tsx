"use client";

import { useState } from "react";
import {
  IconChevronDown,
  IconPlayerStop,
  IconRobot,
} from "@tabler/icons-react";
import {
  ActivityTasks,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
  cn,
  formatElapsed,
  useElapsedSeconds,
} from "@eva/ui";
import {
  subagentTone,
  type SubagentTone,
  type SubagentView,
} from "./agentActivity";
import { ListEnter } from "@/lib/components/ui/ListEnter";

const DOT_CLASS: Record<SubagentTone, string> = {
  active: "bg-primary animate-pulse ring-2 ring-primary/30",
  success: "bg-success",
  danger: "bg-destructive",
  muted: "bg-muted-foreground/50",
};

function AgentDuration({ agent }: { agent: SubagentView }) {
  const running = subagentTone(agent.status) === "active";
  const liveElapsed = useElapsedSeconds(agent.startedAt, running);
  if (agent.startedAt === undefined) return null;
  const seconds =
    running || agent.settledAt === undefined
      ? liveElapsed
      : Math.max(0, Math.floor((agent.settledAt - agent.startedAt) / 1000));
  if (!running && agent.settledAt === undefined) return null;
  return <span className="tabular-nums">{formatElapsed(seconds)}</span>;
}

function AgentStopButton({
  toolUseId,
  onRequestStop,
}: {
  toolUseId: string;
  onRequestStop: (toolUseId: string) => Promise<void>;
}) {
  const [isStopping, setIsStopping] = useState(false);
  const handleStop = async () => {
    setIsStopping(true);
    // Cleanup duplicated into the catch instead of `finally`: React Compiler
    // bails on the whole file when it meets a `finally` clause.
    try {
      await onRequestStop(toolUseId);
    } catch (error) {
      setIsStopping(false);
      throw error;
    }
    setIsStopping(false);
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0"
      disabled={isStopping}
      onClick={(event) => {
        event.stopPropagation();
        void handleStop();
      }}
    >
      {isStopping ? (
        <Spinner size="sm" className="size-3.5" />
      ) : (
        <IconPlayerStop className="size-3.5" />
      )}
      Stop
    </Button>
  );
}

function AgentRow({
  agent,
  isReadOnly,
  onRequestStop,
}: {
  agent: SubagentView;
  isReadOnly: boolean;
  onRequestStop?: (toolUseId: string) => Promise<void>;
}) {
  const tone = subagentTone(agent.status);
  const running = tone === "active";
  const canStop =
    running && agent.backgrounded && !isReadOnly && onRequestStop !== undefined;
  const stepCount = agent.steps.length;

  return (
    <Collapsible defaultOpen={running} className="group rounded-xl bg-muted/50">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[tone])}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {agent.title}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              <span className="capitalize">
                {agent.status.replaceAll("_", " ")}
              </span>
              {agent.backgrounded ? " · background" : ""}
              {stepCount > 0
                ? ` · ${stepCount} ${stepCount === 1 ? "step" : "steps"}`
                : ""}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <AgentDuration agent={agent} />
            <IconChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </span>
        </CollapsibleTrigger>
        {canStop ? (
          <AgentStopButton
            toolUseId={agent.toolUseId}
            onRequestStop={onRequestStop}
          />
        ) : null}
      </div>
      <CollapsibleContent className="px-3 pb-3 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
        {stepCount > 0 ? (
          <ActivityTasks steps={agent.steps} isStreaming={running} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {running
              ? "Waiting for the agent to report activity..."
              : "No recorded activity for this agent."}
          </p>
        )}
        {agent.resultText ? (
          <div className="mt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Result</p>
            <pre className="scroll-fade max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground max-sm:wrap-break-word">
              {agent.resultText}
            </pre>
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Sandbox "Agents" tab: the roster of sub-agents this entity has spawned, each
 * expandable into the transcript of steps it ran. Purely presentational — the
 * surface-specific wrapper derives `agents` and wires the stop mutation.
 */
export function AgentsPanel({
  agents,
  isReadOnly = false,
  onRequestStop,
}: {
  agents: SubagentView[];
  isReadOnly?: boolean;
  onRequestStop?: (toolUseId: string) => Promise<void>;
}) {
  if (agents.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <IconRobot className="h-10 w-10 text-muted-foreground/60" />
        <div className="max-w-md space-y-1">
          <p className="text-sm font-medium">No agents yet</p>
          <p className="text-sm text-muted-foreground">
            Sub-agents Eva spawns while working will appear here with their
            activity and transcripts.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 p-3 sm:p-4">
        {agents.map((agent, index) => (
          <ListEnter key={agent.toolUseId} index={index} fast>
            <AgentRow
              agent={agent}
              isReadOnly={isReadOnly}
              onRequestStop={onRequestStop}
            />
          </ListEnter>
        ))}
      </div>
    </div>
  );
}
