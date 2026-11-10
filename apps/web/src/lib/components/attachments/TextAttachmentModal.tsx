"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@vvedantb/ui";

interface TextAttachmentModalProps {
  title: string;
  text: string;
  readOnly: boolean;
  onSave?: (text: string) => void;
  onClose: () => void;
}

/**
 * Viewer/editor for a text-family chat attachment. Mounted fresh per open
 * (parent fetches text in the click handler and only renders when ready).
 */
export function TextAttachmentModal({
  title,
  text,
  readOnly,
  onSave,
  onClose,
}: TextAttachmentModalProps) {
  const [draft, setDraft] = useState(text);
  const trimmed = draft.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
  const chars = draft.length;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-2">
          <textarea
            value={draft}
            readOnly={readOnly}
            onChange={(event) => setDraft(event.target.value)}
            className="h-48 w-full resize-none rounded-surface border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:h-64"
          />
          <p className="text-xs text-muted-foreground">
            {words} {words === 1 ? "word" : "words"} · {chars}{" "}
            {chars === 1 ? "character" : "characters"}
          </p>
        </DialogBody>
        <DialogFooter>
          {readOnly ? (
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={trimmed === "" || !onSave}
                onClick={() => {
                  if (!onSave || trimmed === "") return;
                  onSave(draft);
                }}
              >
                Save
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
