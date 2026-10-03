"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { Badge } from "@eva/ui";
import type { ChatEntityRef } from "@/lib/components/chat/sandboxChatSurface";
import {
  participantNames,
  statusBadgeVariant,
  statusLabel,
} from "@/lib/components/routed/status";

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

/**
 * Open routed threads for this chat, shown above every sandbox composer. Rows
 * are status only: teammates answer in Manager Ave, and their reply lands in
 * this chat as a message, so there is nowhere further to go from here.
 */
export function RoutedThreadsBanner({ entity }: { entity: ChatEntityRef }) {
  const threads = useQuery(api.routedThreads.listBySource, sourceArgs(entity));
  if (!threads || threads.length === 0) return null;

  return (
    <div className="mb-2 rounded-surface border border-border bg-card px-3 py-2">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
        Waiting on teammates
      </div>
      <ul className="flex flex-col gap-0.5">
        {threads.map((thread) => (
          <li
            key={thread._id}
            className="flex items-center gap-2 px-1.5 py-1.5 text-sm"
          >
            <Badge
              variant={statusBadgeVariant(thread.status)}
              className="h-5 shrink-0 px-1.5 text-[10px] font-medium"
            >
              {statusLabel(thread.status)}
            </Badge>
            <span className="min-w-0 flex-1 truncate font-medium">
              {thread.title}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {participantNames(thread.participants)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
