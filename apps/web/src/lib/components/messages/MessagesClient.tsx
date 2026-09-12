"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { useQueryState } from "nuqs";
import { PageHeader } from "@/lib/components/PageHeader";
import { usePageTitleSync } from "@/lib/contexts/PageTitleContext";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { Button, Skeleton } from "@eva/ui";
import { IconCheck, IconMessage } from "@tabler/icons-react";
import {
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

  return (
    <div className="flex-1 h-full min-h-0 overflow-hidden animate-in fade-in duration-300">
      <ResizablePanelLayout
        storageKey="messages-split"
        leftDefaultSize="40%"
        leftMinWidthPx={300}
        rightMinWidthPx={360}
        defaultRightCollapsed={false}
        leftPanel={() => (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <PageHeader
              title="Messages"
              headerRight={
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={scope === "mine" ? "secondary" : "ghost"}
                    className="h-7 text-xs"
                    onClick={() => void setScope("mine")}
                  >
                    Mine
                  </Button>
                  <Button
                    size="sm"
                    variant={scope === "team" ? "secondary" : "ghost"}
                    className="h-7 text-xs"
                    onClick={() => void setScope("team")}
                  >
                    Team
                  </Button>
                </div>
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
                        ? "No questions for you"
                        : "No team questions"
                    }
                    description="Eva routes design and product questions here"
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
              <div className="flex flex-1 items-center justify-center">
                <EmptyState
                  icon={
                    <IconCheck size={24} className="text-muted-foreground" />
                  }
                  title="Select a thread"
                  description="Questions from any session, task, or project"
                />
              </div>
            )}
          </div>
        )}
      />
    </div>
  );
}
