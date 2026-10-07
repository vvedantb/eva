"use client";

import { useState, type ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from "@eva/ui";

/**
 * "New Document" title dialog, shared by the Documents sidebar and the sandbox
 * Documents tab. `onCreate` resolves true once the doc exists; the parent then
 * closes the dialog. `alternate` swaps the body (the sidebar's PRD upload).
 */
export function NewDocumentDialog({
  open,
  onOpenChange,
  onCreate,
  placeholder,
  busy = false,
  extra,
  alternate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (title: string) => Promise<boolean>;
  placeholder: string;
  /** Blocks closing while the parent is mid-upload. */
  busy?: boolean;
  /** Rendered under the title input. */
  extra?: ReactNode;
  alternate?: ReactNode;
}) {
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setIsCreating(true);
    const created = await onCreate(trimmed);
    setIsCreating(false);
    if (created) setTitle("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy || isCreating) return;
        onOpenChange(next);
        if (!next) setTitle("");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Document</DialogTitle>
        </DialogHeader>
        {alternate ?? (
          <div className="space-y-4">
            <Input
              placeholder={placeholder}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter" && title.trim()) {
                  void handleCreate();
                }
              }}
            />
            {extra}
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  onOpenChange(false);
                  setTitle("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={isCreating || !title.trim()}
              >
                {isCreating ? <Spinner size="sm" /> : "Create Document"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
