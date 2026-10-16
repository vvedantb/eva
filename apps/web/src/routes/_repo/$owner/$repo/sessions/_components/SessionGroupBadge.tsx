"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@eva/ui";
import { IconCheck, IconLink } from "@tabler/icons-react";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { sessionHrefForRow } from "@/lib/components/sidebar/_utils/repoSessionPaths";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";

interface SessionGroupBadgeProps {
  sessionId: Id<"sessions">;
}

/**
 * Header chip for a session in a linked-session group (one agent spun up
 * another): the member count, and a menu that jumps to any member in any
 * repo. Renders nothing for an unlinked session.
 */
export function SessionGroupBadge({ sessionId }: SessionGroupBadgeProps) {
  const members = useQuery(api.sessions.listGroup, { id: sessionId });

  if (!members || members.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Linked sessions"
          className="motion-press inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground active:scale-[0.97]"
        >
          <IconLink size={12} />
          <span className="tabular-nums">{members.length} linked</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Linked sessions
        </DropdownMenuLabel>
        {members.map((member) => (
          <DropdownMenuItem key={member._id} asChild>
            <DynamicLink
              to={sessionHrefForRow(member.repo, member)}
              className="flex items-center gap-2"
            >
              <span className="min-w-0 flex-1 truncate">{member.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {repoDisplayLabel(member.repo)}
              </span>
              {member._id === sessionId ? (
                <IconCheck size={14} className="shrink-0 text-primary" />
              ) : null}
            </DynamicLink>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
