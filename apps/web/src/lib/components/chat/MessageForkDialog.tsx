"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@eva/ui";
import {
  forkDialogSummary,
  forkThreadTitle,
  type ForkTranscriptPrefix,
} from "@/lib/components/chat/messageFork";

export function MessageForkDialog({
  prefix,
  open,
  onOpenChange,
  onConfirm,
}: {
  prefix: ForkTranscriptPrefix | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm?: (prefix: ForkTranscriptPrefix) => Promise<void> | void;
}) {
  const [submitting, setSubmitting] = useState(false);
  if (!prefix) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="message-fork-dialog">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base">Fork from here</DialogTitle>
          <DialogDescription className="text-xs">
            {forkDialogSummary(prefix)}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Starts a new chat with the transcript up to this message. Later
            turns stay on the original thread.
          </p>
          <p className="font-medium">{forkThreadTitle(prefix)}</p>
          <ol className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
            {prefix.turns.map((turn) => (
              <li key={turn.messageId} className="text-xs leading-5">
                <span className="font-medium text-muted-foreground">
                  {turn.role === "user" ? "You" : "Eva"}
                </span>
                <p className="mt-0.5 text-foreground">{turn.text}</p>
              </li>
            ))}
          </ol>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {onConfirm ? (
            <Button
              type="button"
              data-testid="message-fork-confirm"
              disabled={submitting}
              onClick={() => {
                setSubmitting(true);
                Promise.resolve(onConfirm(prefix)).then(
                  () => {
                    setSubmitting(false);
                    onOpenChange(false);
                  },
                  () => {
                    setSubmitting(false);
                  },
                );
              }}
            >
              Start new chat
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
