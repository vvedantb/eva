"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import {
  Button,
  CountPop,
  ListEnter,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  toast,
  tokenTransition,
} from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import { IconPlayerStop, IconTerminal2 } from "@tabler/icons-react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { COMPOSER_CHIP_CLASS } from "@/lib/components/chat/composerChip";

function formatElapsed(startedAt: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hours = Math.floor(min / 60);
  return `${hours}h ${min % 60}m`;
}

/**
 * Chip beside the background agents chip that counts the agent-spawned
 * background Bash processes of a session. The list, with Stop, opens in a
 * popover, so it never pushes the composer down. Self-contained: query +
 * reconcile + kill.
 */
export function BackgroundProcessesChip({
  sessionId,
  isRouteActive = true,
}: {
  sessionId: Id<"sessions">;
  isRouteActive?: boolean;
}) {
  const rows = useHeldQuery(
    api.backgroundProcesses.listRunning,
    isRouteActive ? { sessionId } : "skip",
  );
  const reconcile = useAction(api.sandbox.reconcileBackgroundProcesses);
  const kill = useAction(api.sandbox.killBackgroundProcess);
  const [killingIds, setKillingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const count = rows?.length ?? 0;
  const live = isRouteActive && count > 0;
  // Elapsed times are only on screen inside the popover.
  const ticking = live && popoverOpen;

  /* eslint-disable no-effect/no-external-store-subscription, no-effect/no-adjust-state-on-prop-change --
     The "store" is the clock: a ticking timer that only runs while the tab is
     visible and the popover is open. There is no snapshot to read. */
  useEffect(() => {
    if (!ticking) return;
    let intervalId = 0;
    const start = () => {
      if (intervalId !== 0) return;
      intervalId = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        setNow(Date.now());
      }, 1000);
    };
    const stop = () => {
      if (intervalId === 0) return;
      window.clearInterval(intervalId);
      intervalId = 0;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        start();
        return;
      }
      stop();
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ticking]);
  /* eslint-enable no-effect/no-external-store-subscription, no-effect/no-adjust-state-on-prop-change */

  useEffect(() => {
    if (!live) return;

    const runReconcile = () => {
      if (document.visibilityState !== "visible") return;
      void reconcile({ sessionId }).catch(() => {
        /* swallow — next tick retries */
      });
    };

    runReconcile();
    const interval = window.setInterval(runReconcile, 15_000);
    return () => {
      window.clearInterval(interval);
    };
  }, [live, reconcile, sessionId]);

  const handleKill = (id: Id<"backgroundProcesses">) => {
    setKillingIds((prev) => new Set(prev).add(id));
    void kill({ id })
      .then(() => {
        void reconcile({ sessionId }).catch(() => {});
      })
      .catch(() => {
        toast.error("Couldn't stop background process");
      })
      .finally(() => {
        setKillingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  };

  return (
    <AnimatePresence initial={false}>
      {rows && count > 0 ? (
        <m.div
          key="background-processes"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={tokenTransition.fast}
        >
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`${count} background ${count === 1 ? "process" : "processes"}`}
                className={COMPOSER_CHIP_CLASS}
              >
                <IconTerminal2 className="size-3.5 shrink-0 text-muted-foreground" />
                <CountPop label={String(count)} className="tabular-nums" />
                <span>{count === 1 ? "process" : "processes"}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="start">
              <ul className="divide-y divide-border">
                {rows.map((row, index) => {
                  const isKilling = killingIds.has(row._id);
                  return (
                    <ListEnter
                      key={row._id}
                      as="li"
                      index={index}
                      fast
                      className="flex items-start gap-2 px-3 py-2.5"
                    >
                      <IconTerminal2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 grow">
                        <p
                          className="truncate font-mono text-xs text-foreground"
                          title={row.command}
                        >
                          {row.command}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatElapsed(row.startedAt, now)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={isKilling}
                        onClick={() => handleKill(row._id)}
                      >
                        {isKilling ? (
                          <Spinner
                            variant="circle"
                            size="sm"
                            className="size-3.5"
                          />
                        ) : (
                          <IconPlayerStop className="size-3.5" />
                        )}
                        Stop
                      </Button>
                    </ListEnter>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
