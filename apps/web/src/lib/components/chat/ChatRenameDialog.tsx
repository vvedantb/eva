"use client";

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

interface ChatRenameDialogProps {
  /** The chat being renamed, or null when closed. */
  target: { title: string } | null;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
}

/**
 * Rename dialog for a session chat tab. Same shape as the session rename
 * dialog in the sidebar; hosted by whichever surface opened it (tab strip or
 * sidebar row), because a dialog inside a context menu unmounts with it.
 */
export function ChatRenameDialog({
  target,
  onClose,
  onSave,
}: ChatRenameDialogProps) {
  // Keyed on the target so the field re-seeds each time a chat is picked.
  const [value, setValue] = useState(target?.title ?? "");
  const [seededFor, setSeededFor] = useState(target);
  if (target !== seededFor) {
    setSeededFor(target);
    setValue(target?.title ?? "");
  }
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    if (!value.trim()) return;
    setIsSaving(true);
    try {
      await onSave(value.trim());
      onClose();
    } catch {
      setIsSaving(false);
      return;
    }
    setIsSaving(false);
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              e.preventDefault();
              void save();
            }
          }}
          autoFocus
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            disabled={!value.trim() || isSaving}
            onClick={() => void save()}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
