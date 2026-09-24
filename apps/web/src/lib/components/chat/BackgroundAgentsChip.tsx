"use client";

import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  motionFast,
  Spinner,
} from "@eva/ui";
import type { BackgroundAgentEntry } from "@eva/backend";
import { IconPlayerStop, IconRobot } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { CountPop } from "@/lib/components/ui/CountPop";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { isVisibleBackgroundAgent } from "./backgroundAgentVisibility";

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
  onRequestStop: (toolUseId: string) => Promise<void>;
}) {
  const [stoppingIds, setStoppingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const runningAgents = (backgroundAgents ?? []).filter(
    isVisibleBackgroundAgent,
  );

  const handleStop = async (toolUseId: string) => {
    setStoppingIds((prev) => new Set(prev).add(toolUseId));
    // Cleanup is duplicated into the catch instead of using `finally`: React
    // Compiler bails on the whole file when it meets a `finally` clause.
    const clearStopping = () =>
      setStoppingIds((prev) => {
        const next = new Set(prev);
        next.delete(toolUseId);
        return next;
      });
    try {
      await onRequestStop(toolUseId);
    } catch (error) {
      clearStopping();
      throw error;
    }
    clearStopping();
  };

  const label =
    runningAgents.length === 1
      ? "1 background agent"
      : `${runningAgents.length} background agents`;

  return (
    <AnimatePresence initial={false}>
      {runningAgents.length === 0 ? null : (
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={motionFast}
        >
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="max-sm:hit-target mb-2 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground hover:bg-muted"
              >
                <IconRobot className="size-3.5 shrink-0 text-muted-foreground" />
                <span>{label}</span>
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                  <CountPop
                    label={String(runningAgents.length)}
                    className="tabular-nums"
                  />
                </Badge>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <ul className="divide-y divide-border">
                {runningAgents.map((agent, index) => {
                  const isStopping = stoppingIds.has(agent.toolUseId);
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
                      {!isReadOnly ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          disabled={isStopping}
                          onClick={() => {
                            void handleStop(agent.toolUseId);
                          }}
                        >
                          {isStopping ? (
                            <Spinner size="sm" className="size-3.5" />
                          ) : (
                            <IconPlayerStop className="size-3.5" />
                          )}
                          Stop
                        </Button>
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
