"use client";

import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@vvedantb/ui";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";
import {
  useArchiveSession,
  type ArchiveSessionTarget,
} from "@/lib/components/sidebar/useArchiveSession";

export interface SessionRenameTarget {
  session: { _id: Id<"sessions"> };
}

export interface SessionArchiveTarget extends ArchiveSessionTarget {
  session: ArchiveSessionTarget["session"] & { title: string };
}

interface SessionDialogsProps {
  pathname: string;
  renameTarget: SessionRenameTarget | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onCloseRename: () => void;
  archiveTarget: SessionArchiveTarget | null;
  onCloseArchive: () => void;
  /** After a successful archive, e.g. to close the mobile sidebar drawer. */
  onArchived?: () => void;
}

/**
 * Rename and archive confirm dialogs shared by every session menu: the
 * sessions sidebar, the Chrome session tab strip and the chat header.
 */
export function SessionDialogs({
  pathname,
  renameTarget,
  renameValue,
  onRenameValueChange,
  onCloseRename,
  archiveTarget,
  onCloseArchive,
  onArchived,
}: SessionDialogsProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const { archive, isArchiving } = useArchiveSession();
  const updateSession = useMutation(api.sessions.update);

  const saveRename = () => {
    if (!renameTarget || !renameValue.trim()) return;
    void (async () => {
      setIsRenaming(true);
      try {
        await updateSession({
          id: renameTarget.session._id,
          title: renameValue.trim(),
        });
        mutationSuccess("Session renamed", "session-rename");
        onCloseRename();
      } catch {
        mutationError("Couldn't rename session", "session-rename");
        setIsRenaming(false);
        return;
      }
      setIsRenaming(false);
    })();
  };

  return (
    <>
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) onCloseRename();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => onRenameValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameValue.trim() && renameTarget) {
                e.preventDefault();
                saveRename();
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={onCloseRename}
              disabled={isRenaming}
            >
              Cancel
            </Button>
            <Button
              disabled={!renameValue.trim() || isRenaming}
              onClick={saveRename}
            >
              {isRenaming ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) onCloseArchive();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Session</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will stop the sandbox and remove{" "}
            <span className="font-medium text-foreground">
              {archiveTarget?.session.title}
            </span>{" "}
            from the active list. An open or draft PR will be closed, and
            reopened if you unarchive.
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={onCloseArchive}
              disabled={isArchiving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isArchiving}
              onClick={() => {
                if (!archiveTarget) return;
                void archive(archiveTarget, pathname, () => {
                  onCloseArchive();
                  if (onArchived) onArchived();
                });
              }}
            >
              {isArchiving ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
