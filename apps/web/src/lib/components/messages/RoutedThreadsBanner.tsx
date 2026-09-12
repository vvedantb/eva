"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { Link } from "@tanstack/react-router";
import { IconMessage } from "@tabler/icons-react";
import type { ChatEntityRef } from "@/lib/components/chat/sandboxChatSurface";
import { statusLabel } from "@/lib/components/messages/status";

function sourceArgs(entity: ChatEntityRef): {
  sourceKind: "session" | "task" | "project";
  sourceId: string;
} {
  if (entity.kind === "session") {
    return { sourceKind: "session", sourceId: entity.sessionId };
  }
  if (entity.kind === "task") {
    return { sourceKind: "task", sourceId: entity.taskId };
  }
  return { sourceKind: "project", sourceId: entity.projectId };
}

/** Open routed threads for this chat — shown above every sandbox composer. */
export function RoutedThreadsBanner({ entity }: { entity: ChatEntityRef }) {
  const threads = useQuery(api.routedThreads.listBySource, sourceArgs(entity));
  if (!threads || threads.length === 0) return null;

  return (
    <div className="mb-2 rounded-surface border border-border bg-muted/30 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <IconMessage size={12} />
        Waiting on teammates
      </div>
      <ul className="flex flex-col gap-1">
        {threads.map((thread) => (
          <li key={thread._id}>
            <Link
              to="/messages"
              search={{ thread: thread._id }}
              className="flex items-baseline justify-between gap-2 text-sm hover:underline"
            >
              <span className="min-w-0 truncate">{thread.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {thread.assigneeName} · {statusLabel(thread.status)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
