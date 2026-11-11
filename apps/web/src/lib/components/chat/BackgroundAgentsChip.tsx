"use client";

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  tokenTransition,
  OpenSubagentContext,
  CountPop,
  ListEnter,
} from "@vvedantb/ui";
import type { BackgroundAgentEntry } from "@eva/backend";
import { IconRobot } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import { use, useState } from "react";
import { isVisibleBackgroundAgent } from "./backgroundAgentVisibility";
import { COMPOSER_CHIP_CLASS } from "./composerChip";
import type { RequestAgentStop } from "./useStopBackgroundAgent";
import { AgentStopButton } from "@/lib/components/sandbox/AgentsPanel";

type BackgroundAgent = BackgroundAgentEntry;

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}

export function BackgroundAgentsChip({
  backgroundAgents,
  isReadOnly,
  onRequestStop,
}: {
  backgroundAgents: BackgroundAgent[] | undefined;
  isReadOnly?: boolean;
  onRequestStop: RequestAgentStop;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  // Set by `SubagentThreadLayer` on the sandbox chats that can show the thread.
  const openSubagent = use(OpenSubagentContext);

  const runningAgents = (backgroundAgents ?? []).filter(
    isVisibleBackgroundAgent,
  );

  // The confirm dialog is modal and would close the popover anyway; closing
  // it first keeps focus return predictable.
  const requestStop: RequestAgentStop = (toolUseId, title) => {
    setPopoverOpen(false);
    onRequestStop(toolUseId, title);
  };

  return (
    <AnimatePresence initial={false}>
      {runningAgents.length === 0 ? null : (
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={tokenTransition.fast}
        >
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`${runningAgents.length} background ${runningAgents.length === 1 ? "agent" : "agents"}`}
                className={COMPOSER_CHIP_CLASS}
              >
                <IconRobot className="size-3.5 shrink-0 text-muted-foreground" />
                <CountPop
                  label={String(runningAgents.length)}
                  className="tabular-nums"
                />
                <span>{runningAgents.length === 1 ? "agent" : "agents"}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <ul className="divide-y divide-border">
                {runningAgents.map((agent, index) => {
                  return (
                    <ListEnter
                      key={agent.toolUseId}
                      as="li"
                      index={index}
                      fast
                      className="flex items-start gap-2 px-3 py-2.5"
                    >
                      <IconRobot className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 grow">
                        <p className="truncate text-sm font-medium text-foreground">
                          {agent.description?.trim() || "Background agent"}
                        </p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {formatStatus(agent.status)}
                          {agent.backgrounded ? " · backgrounded" : ""}
                        </p>
                      </div>
                      {openSubagent ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            setPopoverOpen(false);
                            openSubagent(agent.toolUseId);
                          }}
                        >
                          View
                        </Button>
                      ) : null}
                      {!isReadOnly ? (
                        <AgentStopButton
                          toolUseId={agent.toolUseId}
                          title={agent.description?.trim() || undefined}
                          onRequestStop={requestStop}
                        />
                      ) : null}
                    </ListEnter>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
        </m.div>
      )}
    </AnimatePresence>
  );
}
