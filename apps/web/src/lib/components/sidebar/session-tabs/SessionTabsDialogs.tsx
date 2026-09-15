"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@eva/ui";
import {
  mutationError,
  mutationSuccess,
} from "@/lib/utils/mutationToast";
import { useArchiveSession } from "@/lib/components/sidebar/useArchiveSession";

type SessionListItem = FunctionReturnType<typeof api.sessions.list>[number];
type RepoRow = FunctionReturnType<typeof api.githubRepos.list>[number];

export interface SessionRenameTarget {
  session: SessionListItem;
  repo: RepoRow;
}

export interface SessionArchiveTarget {
  session: SessionListItem;
  repo: RepoRow;
  pathSegment: string;
}

interface SessionTabsDialogsProps {
  pathname: string;
  renameTarget: SessionRenameTarget | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onCloseRename: () => void;
  archiveTarget: SessionArchiveTarget | null;
  onCloseArchive: () => void;
}

/** Rename / archive confirm dialogs shared by the Chrome session tab strip. */
export function SessionTabsDialogs({
  pathname,
  renameTarget,
  renameValue,
  onRenameValueChange,
  onCloseRename,
  archiveTarget,
  onCloseArchive,
}: SessionTabsDialogsProps) {
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
            from the active tabs. An open or draft PR will be closed, and
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
                void archive(archiveTarget, pathname, onCloseArchive);
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
