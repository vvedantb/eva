"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction } from "convex/react";
import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
  toast,
} from "@eva/ui";
import {
  IconLoader2,
  IconPlayerStop,
  IconTerminal2,
} from "@tabler/icons-react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";

function formatElapsed(startedAt: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hours = Math.floor(min / 60);
  return `${hours}h ${min % 60}m`;
}

/**
 * Live list of agent-spawned background Bash processes for a session,
 * pinned above the composer. Self-contained: query + reconcile + kill.
 */
export function BackgroundProcessesPanel({
  sessionId,
}: {
  sessionId: Id<"sessions">;
}) {
  const rows = useQuery(api.backgroundProcesses.listRunning, { sessionId });
  const reconcile = useAction(api.sandbox.reconcileBackgroundProcesses);
  const kill = useAction(api.sandbox.killBackgroundProcess);
  const [killingIds, setKillingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [now, setNow] = useState(() => Date.now());

  const hasRows = (rows?.length ?? 0) > 0;

  useEffect(() => {
    if (!hasRows) return;
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
  }, [hasRows]);

  useEffect(() => {
    if (!hasRows) return;

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
  }, [hasRows, reconcile, sessionId]);

  if (!rows || rows.length === 0) return null;

  return (
    <Queue className="mb-2">
      <QueueSection defaultOpen>
        <QueueSectionTrigger>
          <QueueSectionLabel
            count={rows.length}
            label={
              rows.length === 1 ? "background process" : "background processes"
            }
          />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {rows.map((row) => {
              const isKilling = killingIds.has(row._id);
              return (
                <QueueItem key={row._id}>
                  <div className="flex items-start gap-2">
                    <IconTerminal2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 grow">
                      <p className="truncate font-mono text-xs text-foreground">
                        {row.command}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatElapsed(row.startedAt, now)}
                      </p>
                    </div>
                    <QueueItemActions>
                      <QueueItemAction
                        aria-label="Stop background process"
                        disabled={isKilling}
                        className="opacity-100"
                        onClick={() => {
                          setKillingIds((prev) => new Set(prev).add(row._id));
                          void kill({ id: row._id })
                            .then(() => {
                              void reconcile({ sessionId }).catch(() => {});
                            })
                            .catch(() => {
                              toast.error("Couldn't stop background process");
                            })
                            .finally(() => {
                              setKillingIds((prev) => {
                                const next = new Set(prev);
                                next.delete(row._id);
                                return next;
                              });
                            });
                        }}
                      >
                        {isKilling ? (
                          <IconLoader2 className="size-3.5 animate-spin" />
                        ) : (
                          <IconPlayerStop className="size-3.5" />
                        )}
                      </QueueItemAction>
                    </QueueItemActions>
                  </div>
                </QueueItem>
              );
            })}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
}
