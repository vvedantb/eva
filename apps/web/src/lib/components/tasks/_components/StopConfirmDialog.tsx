"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  CircleSpinner,
} from "@eva/ui";

export function StopConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isStopping,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isStopping: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Stop Execution</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground">
          This will stop the agent mid-execution. Any uncommitted progress on
          this run will be lost.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
            disabled={isStopping}
          >
            {isStopping && <CircleSpinner size="sm" />}
            Stop Execution
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
