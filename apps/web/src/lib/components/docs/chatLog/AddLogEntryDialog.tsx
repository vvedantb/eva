"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  Textarea,
} from "@eva/ui";
import { mutationError } from "@/lib/utils/mutationToast";
import type { ChatSourceArg } from "@/lib/components/sandbox/chatSource";

const ENTRY_KINDS = [
  { kind: "note", label: "Note" },
  { kind: "decision", label: "Decision" },
] as const;
type UserEntryKind = (typeof ENTRY_KINDS)[number]["kind"];

/** Add a note or decision to the chat Log by hand. */
export function AddLogEntryDialog({
  source,
  open,
  onOpenChange,
}: {
  source: ChatSourceArg;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const append = useMutation(api.chatLog.append);
  const [kind, setKind] = useState<UserEntryKind>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const reset = () => {
    setKind("note");
    setTitle("");
    setBody("");
  };

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setIsSaving(true);
    const saved = await append({
      source,
      kind,
      author: "user",
      title: trimmed,
      ...(body.trim() ? { body: body.trim() } : {}),
    }).catch(() => {
      mutationError("Couldn't add to the log", "chat-log-append");
      return null;
    });
    setIsSaving(false);
    if (saved === null) return;
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSaving) return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to log</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-1" role="radiogroup" aria-label="Entry kind">
            {ENTRY_KINDS.map((option) => (
              <button
                key={option.kind}
                type="button"
                role="radio"
                aria-checked={kind === option.kind}
                onClick={() => setKind(option.kind)}
                className={cn(
                  "motion-press rounded-md px-2.5 py-1 text-xs active:scale-[0.96]",
                  kind === option.kind
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Input
            placeholder={
              kind === "decision"
                ? "e.g., Keep the Plan tab separate"
                : "e.g., Waiting on design review"
            }
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
          <Textarea
            placeholder={kind === "decision" ? "Why (optional)" : "Detail (optional)"}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={isSaving || !title.trim()}>
              {isSaving ? <Spinner size="sm" /> : "Add"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
