"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@eva/ui";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";

interface SessionGroupRenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Any member of the group; the mutation finds the group from it. */
  sessionId: Id<"sessions">;
  /** The group's current name; empty when it shows a session title instead. */
  name: string | undefined;
}

/**
 * Rename dialog for a linked-session group, shared by the sidebar group and
 * the session header chip. A blank name clears it, so the group shows its
 * oldest session's title again.
 */
export function SessionGroupRenameDialog({
  open,
  onOpenChange,
  sessionId,
  name,
}: SessionGroupRenameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename group</DialogTitle>
        </DialogHeader>
        {/* Content unmounts while closed, so the draft starts fresh each open. */}
        <RenameGroupForm
          sessionId={sessionId}
          name={name}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function RenameGroupForm({
  sessionId,
  name,
  onDone,
}: {
  sessionId: Id<"sessions">;
  name: string | undefined;
  onDone: () => void;
}) {
  const renameGroup = useMutation(api.sessions.renameGroup);
  const [draft, setDraft] = useState(name ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    setIsSaving(true);
    try {
      await renameGroup({ sessionId, name: draft });
      mutationSuccess("Group renamed", "session-group-rename");
      onDone();
    } catch {
      mutationError("Couldn't rename group", "session-group-rename");
    }
    setIsSaving(false);
  };

  return (
    <>
      <Input
        value={draft}
        placeholder="Group name"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isSaving) {
            e.preventDefault();
            void save();
          }
        }}
        autoFocus
      />
      <DialogFooter>
        <Button variant="ghost" onClick={onDone} disabled={isSaving}>
          Cancel
        </Button>
        <Button disabled={isSaving} onClick={() => void save()}>
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}
