"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@vvedantb/ui";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";

interface SessionGroupArchiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Any member of the group; the mutation finds the group from it. */
  sessionId: Id<"sessions">;
  label: string;
  /** After a successful archive, e.g. to leave a session that is now gone. */
  onArchived?: () => void;
}

/**
 * Confirm dialog that archives every active session in a linked-session
 * group, shared by the sidebar group and the session header chip.
 */
export function SessionGroupArchiveDialog({
  open,
  onOpenChange,
  sessionId,
  label,
  onArchived,
}: SessionGroupArchiveDialogProps) {
  // Read only while open; the sidebar may hide members ("Only mine"), but the
  // archive reaches every active member, so the count comes from the server.
  const group = useQuery(
    api.sessions.listGroup,
    open ? { id: sessionId } : "skip",
  );
  const activeCount = group?.members.filter((m) => !m.archived).length;
  const archiveGroup = useMutation(api.sessions.archiveGroup);
  const [isArchiving, setIsArchiving] = useState(false);

  const confirm = async () => {
    setIsArchiving(true);
    try {
      const { archived } = await archiveGroup({ sessionId });
      mutationSuccess(
        `${archived} ${archived === 1 ? "session" : "sessions"} archived`,
        "session-group-archive",
      );
      onOpenChange(false);
      if (onArchived) onArchived();
    } catch {
      mutationError("Couldn't archive group", "session-group-archive");
    }
    setIsArchiving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive group</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This will archive{" "}
          {activeCount === undefined
            ? "every session"
            : `${activeCount} ${activeCount === 1 ? "session" : "sessions"}`}{" "}
          in <span className="font-medium text-foreground">{label}</span>. Their
          sandboxes stop, and open or draft PRs close. You can unarchive each
          session later.
        </p>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isArchiving}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={isArchiving || activeCount === 0}
            onClick={() => void confirm()}
          >
            {isArchiving ? "Archiving…" : "Archive all"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
