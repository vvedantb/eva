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
import { sessionCountLabel } from "@eva/shared";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";

interface SessionGroupArchiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: Id<"sessions">;
  label: string;
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
        `${sessionCountLabel(archived)} archived`,
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
            : sessionCountLabel(activeCount)}{" "}
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
