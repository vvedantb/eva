"use client";

import { useEffect } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { useQueryState } from "nuqs";
import { PageHeader } from "@/lib/components/PageHeader";
import { usePageTitleSync } from "@/lib/contexts/PageTitleContext";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { Badge, Skeleton, Tabs, TabsList, TabsTrigger } from "@eva/ui";
import { IconMessage } from "@tabler/icons-react";
import {
  isMessagesScope,
  messagesScopeParser,
  messagesThreadParser,
} from "@/lib/search-params";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import { ThreadList } from "@/lib/components/messages/ThreadList";
import { ThreadDetailPane } from "@/lib/components/messages/ThreadDetailPane";

export function MessagesClient() {
  usePageTitleSync("Messages");
  const [scope, setScope] = useQueryState("scope", messagesScopeParser);
  const [selectedId, setSelectedId] = useQueryState(
    "thread",
    messagesThreadParser,
  );

  const mine = useQuery(api.routedThreads.listMine, { status: "open" });
  const team = useQuery(api.routedThreads.listTeam, { status: "open" });
  const threads = scope === "team" ? team : mine;
  const selected = threads?.find((row) => row._id === selectedId) ?? null;
  const waitingCount = mine?.filter((row) => row.needsMyReply).length ?? 0;

  useEffect(() => {
    if (!threads || threads.length === 0) return;
    if (selectedId && threads.some((row) => row._id === selectedId)) return;
    const first = threads.find((row) => row.needsMyReply) ?? threads[0];
    void setSelectedId(first._id);
  }, [threads, selectedId, setSelectedId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      }
      if (!threads || threads.length === 0) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const index = threads.findIndex((row) => row._id === selectedId);
        const next =
          index < 0
            ? threads[0]
            : event.key === "ArrowDown"
              ? threads[Math.min(index + 1, threads.length - 1)]
              : threads[Math.max(index - 1, 0)];
        if (next) void setSelectedId(next._id);
      } else if (event.key === "Escape") {
        void setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="flex-1 h-full min-h-0 overflow-hidden animate-in fade-in duration-300">
      <ResizablePanelLayout
        storageKey="messages-split-v2"
        leftDefaultSize="34%"
        leftMinWidthPx={300}
        rightMinWidthPx={400}
        defaultRightCollapsed={false}
        leftPanel={() => (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <PageHeader
              title="Messages"
              headerRight={
                <Tabs
                  value={scope}
                  onValueChange={(value) => {
                    if (isMessagesScope(value)) void setScope(value);
                  }}
                >
                  <TabsList className="tabs-segmented h-7">
                    <TabsTrigger
                      value="mine"
                      className="h-6 gap-1 px-2.5 py-0 text-xs"
                    >
                      Mine
                      {waitingCount > 0 ? (
                        <Badge className="h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
                          {waitingCount}
                        </Badge>
                      ) : null}
                    </TabsTrigger>
                    <TabsTrigger value="team" className="h-6 px-2.5 py-0 text-xs">
                      Team
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              }
            />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
              {threads === undefined ? (
                <div
                  className="space-y-2 p-4"
                  aria-busy="true"
                  aria-label="Loading messages"
                >
                  <Skeleton className="h-4 w-24" />
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : threads.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <EmptyState
                    icon={
                      <IconMessage
                        size={24}
                        className="text-muted-foreground"
                      />
                    }
                    title={
                      scope === "mine"
                        ? "Nothing waiting on you"
                        : "No open team questions"
                    }
                    description="When Eva needs a design or product call, it shows up here"
                    animate
                  />
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto scrollbar">
                  <ThreadList
                    threads={threads}
                    selectedId={selectedId}
                    onSelect={(id) => void setSelectedId(id)}
                  />
                </div>
              )}
            </div>
          </div>
        )}
        rightPanel={() => (
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
            {selected ? (
              <ThreadDetailPane thread={selected} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                <IconMessage className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Select a question to reply
                </p>
              </div>
            )}
          </div>
        )}
      />
    </div>
  );
}
