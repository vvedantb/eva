"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@vvedantb/ui";
import {
  IconCheck,
  IconLink,
  IconLinkOff,
  IconPencil,
} from "@tabler/icons-react";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { SessionGroupRenameDialog } from "@/lib/components/sidebar/_components/SessionGroupRenameDialog";
import { sessionHrefForRow } from "@/lib/components/sidebar/_utils/repoSessionPaths";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";

interface SessionGroupBadgeProps {
  sessionId: Id<"sessions">;
}

/**
 * Header chip for a session in a linked-session group (one agent spun up
 * another): the member count, and a menu that jumps to any member in any
 * repo, renames the group, or takes this session out. Renders nothing for an
 * unlinked session.
 */
export function SessionGroupBadge({ sessionId }: SessionGroupBadgeProps) {
  const group = useQuery(api.sessions.listGroup, { id: sessionId });
  const removeFromGroup = useMutation(api.sessions.removeFromGroup);
  const [isRenameOpen, setIsRenameOpen] = useState(false);

  if (!group) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={group.name ?? "Linked sessions"}
            className="motion-press inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground active:scale-[0.97]"
          >
            <IconLink size={12} />
            <span className="tabular-nums">{group.members.length} linked</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 min-w-64">
          <DropdownMenuLabel className="truncate text-xs text-muted-foreground">
            {group.name ?? "Linked sessions"}
          </DropdownMenuLabel>
          {group.members.map((member) => (
            <DropdownMenuItem key={member._id} asChild>
              <DynamicLink
                to={sessionHrefForRow(member.repo, member)}
                className="flex items-center gap-2"
              >
                <span className="min-w-0 flex-1 truncate">{member.title}</span>
                {member.archived ? (
                  <span className="shrink-0 text-xs text-muted-foreground/70">
                    Archived
                  </span>
                ) : null}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {repoDisplayLabel(member.repo)}
                </span>
                {member._id === sessionId ? (
                  <IconCheck size={14} className="shrink-0 text-primary" />
                ) : null}
              </DynamicLink>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setIsRenameOpen(true)}>
            <IconPencil size={16} />
            Rename group
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              try {
                await removeFromGroup({ sessionId });
                mutationSuccess("Removed from group", "session-group-remove");
              } catch {
                mutationError(
                  "Couldn't remove from group",
                  "session-group-remove",
                );
              }
            }}
          >
            <IconLinkOff size={16} />
            Remove from group
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SessionGroupRenameDialog
        open={isRenameOpen}
        onOpenChange={setIsRenameOpen}
        sessionId={sessionId}
        name={group.name}
      />
    </>
  );
}
